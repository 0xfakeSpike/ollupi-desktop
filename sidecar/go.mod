module github.com/0xfakeSpike/ollupi-desktop/sidecar

go 1.25.0

require (
	github.com/0xfakeSpike/ollupi v0.0.0
	gopkg.in/yaml.v3 v3.0.1
)

require (
	github.com/coder/websocket v1.8.15 // indirect
	github.com/google/jsonschema-go v0.4.2 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/mattn/go-sqlite3 v1.14.22 // indirect
	github.com/openai/openai-go v1.12.0 // indirect
	github.com/robfig/cron/v3 v3.0.1 // indirect
	github.com/tidwall/gjson v1.18.0 // indirect
	github.com/tidwall/match v1.1.1 // indirect
	github.com/tidwall/pretty v1.2.1 // indirect
	github.com/tidwall/sjson v1.2.5 // indirect
	golang.org/x/sys v0.46.0 // indirect
	golang.org/x/text v0.21.0 // indirect
	gorm.io/driver/sqlite v1.6.0 // indirect
	gorm.io/gorm v1.31.2 // indirect
)

// Develop against the sibling checkout; drop this once ollupi is tagged.
replace github.com/0xfakeSpike/ollupi => ../../ollupi
