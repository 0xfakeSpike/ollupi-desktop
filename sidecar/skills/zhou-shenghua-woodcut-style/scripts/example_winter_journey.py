# 冬旅式霜林驮队（1600×900）：满版霜树冠，中间一条白雪道，一小队驮牛走过
import sys; sys.path.insert(0,'/tmp/shuiyin')
from shuiyin import *
W,H=1600,900
A=(48,44,1552,792)
P=Print(W,H,seed=1998,area=A)
x0,y0,x1,y1=A
c=PALETTES['frost_blue']
# 天：一窄条横向扫刷的淡蓝
wash(P,P.poly_mask([(x0,y0),(x1,y0),(x1,y1),(x0,y1)]),c['pale'],alpha=1,sweep=0.45,grain=0.4)
wash(P,P.gradient(y0,200,1,0,x0,x1),c['light'],alpha=0.8,sweep=0.6,grain=0.4)
# 底色：树冠后面压一层深蓝，免得露出纸白
P.paint(P.fill_below(P.ridge(x0,x1,165,12,seed=4),y1),c['mid'],alpha=1,grain=0.3,streak=0.3)
r=random.Random(7)
def row(y,ry,rx,jit=18):
    # 一排树冠挨着排开，彼此略有重叠
    out,x=[],x0-rx*r.uniform(0,1)
    while x<x1+rx:
        k=r.uniform(0.75,1.3)
        out.append((x,y+r.uniform(-jit,jit),rx*k,ry*k))
        x+=rx*k*r.uniform(1.4,1.8)
    return out
# 霜树冠：由远到近、由小到大，从上往下画
L,d=P.layer()
for y,ry,rx,col in [(180,20,26,c['light']),(215,24,32,c['light']),(258,30,40,c['mid']),(310,36,48,c['mid']),
                   (372,44,58,c['mid']),(445,52,68,c['deep']),(530,60,80,c['deep'])]:
    P.frost_crowns(d,row(y,ry,rx),col,c['snow'],density=3,mark=1.0)
P.put(L,grain=0.15,blur=0.3)
# 雪道：一条横穿画面、微微起伏的白带，下面是留白雪地
road=P.ridge(x0,x1,628,8,freq=1.5,seed=11)
P.paint(P.fill_below(road,y1),c['snow'],alpha=1,grain=0.05,blur=0.8)
P.paint(P.fill_below([(x,y+26) for x,y in road],y1),c['pale'],alpha=0.55,grain=0.08,streak=0.4)
P.paint(P.fill_below([(x,y+60) for x,y in road],y1),c['snow'],alpha=1,grain=0.04,blur=1.2)
# 前景：雪道下面再压一排最大的近树，左边留一个缺口透出雪地
L,d=P.layer()
P.frost_crowns(d,[t for t in row(790,80,105,jit=14) if not 300<t[0]<820],c['deep'],c['snow'],density=3,mark=1.2)
P.put(L,grain=0.15,blur=0.3)
# 驮队：米粒大小，背上搭彩毯；领头一个围红围巾的人
L,d=P.layer()
def on_road(x): return min(road,key=lambda p:abs(p[0]-x))[1]+18
blankets=[[c['accent'],(240,200,120)],[(226,170,70),c['accent']],[c['deep'],(240,200,120)],[c['accent'],c['light']],[(226,170,70),c['deep']]]
for i,bl in enumerate(blankets):
    x=520+i*58
    P.cow(d,x,on_road(x),1.1,body=(70,64,60),patch=(40,36,34),blanket=bl,facing=1)
P.person(d,860,on_road(860),2.0,coat=c['dark'],scarf=c['accent'])
P.put(L,grain=0.1,blur=0.25)
P.caption((x0,834),'冬旅',30,color=(54,52,50),bold=True)
P.caption((x0+90,838),'霜林里一条雪道，驮队慢慢走过',24)
P.caption((x1,838),'水印木刻风格习作',24,anchor='ra')
P.finish('/tmp/shuiyin/out.png')
