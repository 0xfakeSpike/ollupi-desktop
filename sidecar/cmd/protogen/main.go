// Command protogen generates the TypeScript wire contract of ollupi's gateway
// (packages/protocol/src/generated.ts) from ollupi's Go source, so the UI's
// types are derived from the code that produces the JSON instead of copied
// by hand. It reads the source with go/parser rather than reflection, which
// gives it the gateway's unexported message structs and the values of typed
// string constants (statuses, decisions, policies).
//
// It emits:
//   - an interface for every struct the gateway puts on the wire (every type
//     in gateway/protocol.go, plus the rows the handlers return inline), and
//     everything those reference, following encoding/json's rules;
//   - a string-literal union for every typed string with constants;
//   - the method, notification and request name unions from the gateway's
//     constants, which the hand-written method maps are checked against;
//   - the error codes and the built-in tool names.
//
// Anything it cannot map faithfully (a custom MarshalJSON, a ",string" tag,
// two Go types with one TypeScript name) stops generation with an error.
//
// Usage, from the sidecar module: go run ./cmd/protogen -out ../packages/protocol/src/generated.ts
// (-check compares instead of writing).
package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

const module = "github.com/0xfakeSpike/ollupi"

// packages are the ollupi packages whose types can appear on the wire.
var packages = []string{
	"repo", "tools", "pkg/llm", "pkg/jsonrpc", "gateway", "agent/permission",
	"agent/contextmanager", "tools/userinput", "tools/plan", "tools/subagent", "tools/shell", "tools/cron",
}

// roots are emitted besides everything declared in gateway/protocol.go:
// types the gateway decodes or returns outside protocol.go (thread/list's
// filter, the rows workspaces.go, memory.go and cron.go return from inline
// structs), the argument types of built-in tools the UI reads off tool-call
// items, and the approval policies ApprovalPolicy holds.
var roots = []string{
	"repo.ThreadFilter", "repo.WorkspaceRow", "repo.MemoryRow", "repo.MemoryStatus", "repo.CronJobRow",
	"tools/plan.Plan", "tools/subagent.Call", "tools/userinput.Request", "agent/permission.Policy",
}

// names gives a TypeScript name where the Go name alone would be ambiguous
// or meaningless outside its package.
var names = map[string]string{
	"agent/permission.Policy":  "ApprovalPolicy",
	"tools/plan.Plan":          "PlanArguments",
	"tools/plan.Step":          "PlanStep",
	"tools/plan.Status":        "PlanStepStatus",
	"tools/subagent.Call":      "SubagentArguments",
	"tools/userinput.Request":  "UserInputArguments",
	"tools/userinput.Question": "UserInputQuestion",
	"tools/userinput.Option":   "UserInputOption",
	"tools/userinput.Answer":   "UserInputAnswer",
}

// fieldTypes types fields that Go declares as plain strings but that only
// ever hold one package's constants; each entry names where those live.
var fieldTypes = map[string]string{
	"repo.PermissionSettings.ApprovalPolicy": "ApprovalPolicy", // permission.Policy.Validate
	"tools.Await.By":                         "AwaitBy",        // tools.AwaitUser, tools.AwaitAgent
}

type pkg struct {
	path  string
	files []*ast.File
	types map[string]*ast.TypeSpec
	// consts maps a named type to its constant values, in source order.
	consts map[string][]string
	// untyped holds untyped constants by name.
	untyped map[string]ast.Expr
	methods map[string]map[string]bool // type name -> method names
}

type gen struct {
	pkgs    map[string]*pkg
	emitted map[string]string // qualified name -> TS name
	tsNames map[string]string // TS name -> qualified name
	queue   []string
	out     bytes.Buffer
}

func main() {
	out := flag.String("out", "", "output file")
	check := flag.Bool("check", false, "fail if -out differs from what would be generated, instead of writing it")
	flag.Parse()
	if *out == "" {
		log.Fatal("protogen: -out is required")
	}
	dir, err := moduleDir()
	if err != nil {
		log.Fatal(err)
	}
	g := &gen{pkgs: map[string]*pkg{}, emitted: map[string]string{}, tsNames: map[string]string{}}
	for _, p := range packages {
		if g.pkgs[p], err = parse(filepath.Join(dir, p), p); err != nil {
			log.Fatal(err)
		}
	}
	src, err := g.generate(revision(dir))
	if err != nil {
		log.Fatalf("protogen: %v", err)
	}
	if *check {
		current, err := os.ReadFile(*out)
		if err != nil || !bytes.Equal(current, src) {
			log.Fatalf("protogen: %s is out of date with ollupi; run pnpm protocol:generate", *out)
		}
		return
	}
	if err := os.WriteFile(*out, src, 0o644); err != nil {
		log.Fatal(err)
	}
}

func moduleDir() (string, error) {
	cmd := exec.Command("go", "list", "-m", "-f", "{{.Dir}}", module)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("protogen: locate %s: %w", module, err)
	}
	return strings.TrimSpace(string(out)), nil
}

func revision(dir string) string {
	out, err := exec.Command("git", "-C", dir, "log", "-1", "--format=%h %s").Output()
	if err != nil {
		return "unknown revision"
	}
	return strings.TrimSpace(string(out))
}

func parse(dir, path string) (*pkg, error) {
	fset := token.NewFileSet()
	set, err := parser.ParseDir(fset, dir, func(fi os.FileInfo) bool { return !strings.HasSuffix(fi.Name(), "_test.go") }, 0)
	if err != nil {
		return nil, err
	}
	p := &pkg{path: path, types: map[string]*ast.TypeSpec{}, consts: map[string][]string{}, untyped: map[string]ast.Expr{}, methods: map[string]map[string]bool{}}
	for _, astPkg := range set {
		for name, f := range astPkg.Files {
			fileNames[f] = filepath.Base(name)
			p.files = append(p.files, f)
		}
	}
	sort.Slice(p.files, func(i, j int) bool { return p.files[i].Pos() < p.files[j].Pos() })
	for _, f := range p.files {
		for _, decl := range f.Decls {
			switch d := decl.(type) {
			case *ast.GenDecl:
				p.collect(d)
			case *ast.FuncDecl:
				if d.Recv != nil && len(d.Recv.List) == 1 {
					recv := typeName(d.Recv.List[0].Type)
					if p.methods[recv] == nil {
						p.methods[recv] = map[string]bool{}
					}
					p.methods[recv][d.Name.Name] = true
				}
			}
		}
	}
	return p, nil
}

func (p *pkg) collect(d *ast.GenDecl) {
	switch d.Tok {
	case token.TYPE:
		for _, s := range d.Specs {
			ts := s.(*ast.TypeSpec)
			p.types[ts.Name.Name] = ts
		}
	case token.CONST:
		var typ string
		for _, s := range d.Specs {
			vs := s.(*ast.ValueSpec)
			if vs.Type != nil {
				typ = typeName(vs.Type)
			} else if len(vs.Values) > 0 {
				typ = "" // a new untyped group starts
			}
			for i, n := range vs.Names {
				if i >= len(vs.Values) {
					continue
				}
				if typ == "" {
					p.untyped[n.Name] = vs.Values[i]
					continue
				}
				if lit, ok := vs.Values[i].(*ast.BasicLit); ok && lit.Kind == token.STRING {
					v, _ := strconv.Unquote(lit.Value)
					p.consts[typ] = append(p.consts[typ], v)
				}
			}
		}
	}
}

func typeName(e ast.Expr) string {
	switch t := e.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		return typeName(t.X)
	}
	return ""
}

func (g *gen) generate(rev string) ([]byte, error) {
	fmt.Fprintf(&g.out, "// Code generated by sidecar/cmd/protogen from ollupi (%s). DO NOT EDIT.\n", rev)
	g.out.WriteString("// Regenerate with `pnpm protocol:generate` after changing ollupi.\n\n")

	gw := g.pkgs["gateway"]
	var protocolTypes []string
	for _, f := range gw.files {
		for _, decl := range f.Decls {
			if d, ok := decl.(*ast.GenDecl); ok && d.Tok == token.TYPE {
				for _, s := range d.Specs {
					ts := s.(*ast.TypeSpec)
					if _, isStruct := ts.Type.(*ast.StructType); isStruct && definedIn(f, "protocol.go") {
						protocolTypes = append(protocolTypes, "gateway."+ts.Name.Name)
					}
				}
			}
		}
	}
	for _, q := range append(protocolTypes, roots...) {
		if _, err := g.ref(q); err != nil {
			return nil, err
		}
	}
	g.out.WriteString("export type AwaitBy = " + union(g.untypedStrings("tools", "AwaitUser", "AwaitAgent")) + "\n\n")
	for len(g.queue) > 0 {
		q := g.queue[0]
		g.queue = g.queue[1:]
		if err := g.emit(q); err != nil {
			return nil, err
		}
	}
	if err := g.emitNames(); err != nil {
		return nil, err
	}
	g.emitErrorCodes()
	g.emitBuiltinTools()
	return g.out.Bytes(), nil
}

func definedIn(f *ast.File, base string) bool {
	return fileNames[f] == base
}

// fileNames records each parsed file's base name; protocol.go is the
// gateway's declared wire vocabulary.
var fileNames = map[*ast.File]string{}

// ref returns the TypeScript name of a qualified Go type ("repo.ItemRow"),
// queueing it for emission the first time.
func (g *gen) ref(q string) (string, error) {
	if ts, ok := g.emitted[q]; ok {
		return ts, nil
	}
	pkgPath, name := splitQualified(q)
	p := g.pkgs[pkgPath]
	if p == nil || p.types[name] == nil {
		return "", fmt.Errorf("type %s is not in the parsed packages", q)
	}
	if m := p.methods[name]; m["MarshalJSON"] || m["MarshalText"] {
		return "", fmt.Errorf("%s has a custom JSON encoding; map it by hand", q)
	}
	ts := names[q]
	if ts == "" {
		ts = exported(name)
	}
	if other, taken := g.tsNames[ts]; taken {
		return "", fmt.Errorf("%s and %s would both be named %s; add one to names", other, q, ts)
	}
	g.emitted[q], g.tsNames[ts] = ts, q
	g.queue = append(g.queue, q)
	return ts, nil
}

func splitQualified(q string) (string, string) {
	i := strings.LastIndex(q, ".")
	return q[:i], q[i+1:]
}

func exported(s string) string {
	r := []rune(s)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
}

func (g *gen) emit(q string) error {
	pkgPath, name := splitQualified(q)
	p := g.pkgs[pkgPath]
	spec := p.types[name]
	ts := g.emitted[q]
	switch t := spec.Type.(type) {
	case *ast.StructType:
		var extends, fields []string
		for _, f := range t.Fields.List {
			parts, embedded, err := g.field(p, q, f)
			if err != nil {
				return err
			}
			if embedded != "" {
				extends = append(extends, embedded)
			}
			fields = append(fields, parts...)
		}
		head := "export interface " + ts
		if len(extends) > 0 {
			head += " extends " + strings.Join(extends, ", ")
		}
		g.out.WriteString(head + " {\n")
		for _, f := range fields {
			g.out.WriteString("  " + f + "\n")
		}
		g.out.WriteString("}\n\n")
	case *ast.Ident:
		if t.Name != "string" {
			return fmt.Errorf("%s: only string-based named types are supported", q)
		}
		if values := p.consts[name]; len(values) > 0 {
			g.out.WriteString("export type " + ts + " = " + union(values) + "\n\n")
		} else {
			g.out.WriteString("export type " + ts + " = string\n\n")
		}
	default:
		return fmt.Errorf("%s: unsupported type declaration", q)
	}
	return nil
}

// field renders one struct field, or names the type it embeds.
func (g *gen) field(p *pkg, owner string, f *ast.Field) (lines []string, embedded string, err error) {
	tag := ""
	if f.Tag != nil {
		raw, _ := strconv.Unquote(f.Tag.Value)
		tag = reflect.StructTag(raw).Get("json")
	}
	if tag == "-" {
		return nil, "", nil
	}
	jsonName, opts, _ := strings.Cut(tag, ",")
	omitempty := strings.Contains(","+opts+",", ",omitempty,")
	if strings.Contains(","+opts+",", ",string,") {
		return nil, "", fmt.Errorf("%s: ,string tags are not supported", owner)
	}
	if len(f.Names) == 0 {
		// Embedded: without a json name its fields are promoted.
		if jsonName == "" {
			ts, err := g.typeOf(p, f.Type)
			return nil, ts, err
		}
		if ast.IsExported(typeName(f.Type)) {
			ts, err := g.typeOf(p, f.Type)
			return []string{prop(jsonName, ts, omitempty, isPointer(f.Type))}, "", err
		}
		return nil, "", nil
	}
	for _, n := range f.Names {
		if !n.IsExported() {
			continue
		}
		key := jsonName
		if key == "" {
			key = n.Name
		}
		ts := fieldTypes[owner+"."+n.Name]
		if ts == "" {
			if ts, err = g.typeOf(p, f.Type); err != nil {
				return nil, "", fmt.Errorf("%s.%s: %w", owner, n.Name, err)
			}
		}
		lines = append(lines, prop(key, ts, omitempty, isPointer(f.Type)))
	}
	return lines, "", nil
}

func prop(key, ts string, omitempty, pointer bool) string {
	if !validIdent(key) {
		key = strconv.Quote(key)
	}
	switch {
	case omitempty:
		return key + "?: " + ts
	case pointer:
		// encoding/json writes a nil pointer as null.
		return key + ": " + ts + " | null"
	}
	return key + ": " + ts
}

func validIdent(s string) bool {
	for i, r := range s {
		if !(unicode.IsLetter(r) || r == '_' || r == '$' || (i > 0 && unicode.IsDigit(r))) {
			return false
		}
	}
	return s != ""
}

func isPointer(e ast.Expr) bool {
	_, ok := e.(*ast.StarExpr)
	return ok
}

// typeOf maps a Go type expression in package p to TypeScript.
func (g *gen) typeOf(p *pkg, e ast.Expr) (string, error) {
	switch t := e.(type) {
	case *ast.Ident:
		switch t.Name {
		case "string":
			return "string", nil
		case "bool":
			return "boolean", nil
		case "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "float32", "float64":
			return "number", nil
		case "any":
			return "unknown", nil
		}
		return g.ref(p.path + "." + t.Name)
	case *ast.StarExpr:
		return g.typeOf(p, t.X)
	case *ast.ArrayType:
		elem, err := g.typeOf(p, t.Elt)
		if err != nil {
			return "", err
		}
		if strings.ContainsAny(elem, " |") {
			elem = "(" + elem + ")"
		}
		return elem + "[]", nil
	case *ast.MapType:
		if k, ok := t.Key.(*ast.Ident); !ok || k.Name != "string" {
			return "", fmt.Errorf("only string-keyed maps are supported")
		}
		v, err := g.typeOf(p, t.Value)
		if err != nil {
			return "", err
		}
		return "Record<string, " + v + ">", nil
	case *ast.InterfaceType:
		return "unknown", nil
	case *ast.SelectorExpr:
		x, _ := t.X.(*ast.Ident)
		if x == nil {
			return "", fmt.Errorf("unsupported selector")
		}
		switch x.Name + "." + t.Sel.Name {
		case "time.Time":
			return "string", nil // RFC 3339
		case "json.RawMessage":
			return "unknown", nil
		}
		target, err := g.importPath(p, x.Name)
		if err != nil {
			return "", err
		}
		return g.ref(target + "." + t.Sel.Name)
	case *ast.StructType:
		var parts []string
		for _, f := range t.Fields.List {
			lines, embedded, err := g.field(p, "inline", f)
			if err != nil {
				return "", err
			}
			if embedded != "" {
				return "", fmt.Errorf("embedding in an inline struct is not supported")
			}
			parts = append(parts, lines...)
		}
		return "{ " + strings.Join(parts, "; ") + " }", nil
	}
	return "", fmt.Errorf("unsupported type expression %T", e)
}

// importPath resolves a package name used in p to one of the parsed ollupi
// packages.
func (g *gen) importPath(p *pkg, local string) (string, error) {
	for _, f := range p.files {
		for _, imp := range f.Imports {
			path, _ := strconv.Unquote(imp.Path.Value)
			name := filepath.Base(path)
			if imp.Name != nil {
				name = imp.Name.Name
			}
			if name != local || !strings.HasPrefix(path, module+"/") {
				continue
			}
			rel := strings.TrimPrefix(path, module+"/")
			if g.pkgs[rel] == nil {
				return "", fmt.Errorf("package %s is not in protogen's package list", rel)
			}
			return rel, nil
		}
	}
	return "", fmt.Errorf("package %q is not an ollupi package", local)
}

func (g *gen) untypedStrings(pkgPath string, consts ...string) []string {
	var out []string
	for _, c := range consts {
		lit, ok := g.pkgs[pkgPath].untyped[c].(*ast.BasicLit)
		if !ok {
			log.Fatalf("protogen: %s.%s is not a string constant", pkgPath, c)
		}
		v, _ := strconv.Unquote(lit.Value)
		out = append(out, v)
	}
	return out
}

// emitNames writes the gateway's method, notification and request names.
// methodInitialized is the one name in the method block the client sends as
// a notification (conn.Notify accepts only it).
func (g *gen) emitNames() error {
	groups := map[string][]string{}
	for name, value := range g.pkgs["gateway"].untyped {
		lit, ok := value.(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			continue
		}
		v, _ := strconv.Unquote(lit.Value)
		switch {
		case name == "methodInitialized":
			groups["ClientNotificationName"] = append(groups["ClientNotificationName"], v)
		case strings.HasPrefix(name, "method"):
			groups["ClientMethodName"] = append(groups["ClientMethodName"], v)
		case strings.HasPrefix(name, "notify"):
			groups["ServerNotificationName"] = append(groups["ServerNotificationName"], v)
		case strings.HasPrefix(name, "request"):
			groups["ServerRequestName"] = append(groups["ServerRequestName"], v)
		}
	}
	// Some notifications are sent with a literal name rather than a constant
	// (workspace/changed in workspaces.go): collect every literal passed as
	// the method of a notify or Notify call.
	for _, f := range g.pkgs["gateway"].files {
		ast.Inspect(f, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || len(call.Args) == 0 {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || (sel.Sel.Name != "notify" && sel.Sel.Name != "Notify") {
				return true
			}
			if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == token.STRING {
				v, _ := strconv.Unquote(lit.Value)
				if !slices.Contains(groups["ServerNotificationName"], v) {
					groups["ServerNotificationName"] = append(groups["ServerNotificationName"], v)
				}
			}
			return true
		})
	}
	for _, group := range []string{"ClientMethodName", "ClientNotificationName", "ServerNotificationName", "ServerRequestName"} {
		values := groups[group]
		if len(values) == 0 {
			return fmt.Errorf("no gateway constants for %s", group)
		}
		sort.Strings(values)
		g.out.WriteString("export type " + group + " = " + union(values) + "\n\n")
	}
	return nil
}

func (g *gen) emitErrorCodes() {
	codes := map[string]string{}
	for pkgPath, prefix := range map[string]string{"gateway": "err", "pkg/jsonrpc": "Code"} {
		for name, value := range g.pkgs[pkgPath].untyped {
			if !strings.HasPrefix(name, prefix) {
				continue
			}
			if v, ok := intLiteral(value); ok {
				codes[exported(strings.TrimPrefix(name, prefix))] = v
			}
		}
	}
	keys := make([]string, 0, len(codes))
	for k := range codes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	g.out.WriteString("export const ErrorCode = {\n")
	for _, k := range keys {
		g.out.WriteString("  " + k + ": " + codes[k] + ",\n")
	}
	g.out.WriteString("} as const\n\nexport type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]\n\n")
}

func intLiteral(e ast.Expr) (string, bool) {
	switch v := e.(type) {
	case *ast.BasicLit:
		return v.Value, v.Kind == token.INT
	case *ast.UnaryExpr:
		if s, ok := intLiteral(v.X); ok && v.Op == token.SUB {
			return "-" + s, true
		}
	}
	return "", false
}

func (g *gen) emitBuiltinTools() {
	tools := []struct{ key, pkg, name string }{
		{"Shell", "tools/shell", "ToolName"},
		{"Plan", "tools/plan", "Tool"},
		{"UserInput", "tools/userinput", "Tool"},
		{"Subagent", "tools/subagent", "Tool"},
		{"ReadToolOutput", "agent/contextmanager", "ToolReadOutput"},
	}
	g.out.WriteString("/** Names of the tools ollupi registers itself. */\nexport const BuiltinTool = {\n")
	for _, t := range tools {
		g.out.WriteString("  " + t.key + ": " + union(g.untypedStrings(t.pkg, t.name)) + ",\n")
	}
	g.out.WriteString("} as const\n\n")
	// ItemRow.server holds the provider id of a call; the UI needs the cron
	// provider's to know when a turn changed its thread's scheduled tasks.
	g.out.WriteString("/** Provider ids ItemRow.server can hold. */\nexport const ToolProvider = {\n")
	g.out.WriteString("  Cron: " + union(g.untypedStrings("tools/cron", "ProviderName")) + ",\n")
	g.out.WriteString("} as const\n")
}

func union(values []string) string {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = "'" + strings.ReplaceAll(v, "'", "\\'") + "'"
	}
	return strings.Join(quoted, " | ")
}
