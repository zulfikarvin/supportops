"""Render the SupportOps example activity as editable SVG and PNG swimlanes."""
from pathlib import Path
from html import escape
import textwrap
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / 'docs' / 'diagrams'
OUT.mkdir(parents=True, exist_ok=True)
W, H = 2160, 3220
im = Image.new('RGB', (W, H), 'white')
draw = ImageDraw.Draw(im)
regular = 'C:/Windows/Fonts/arial.ttf'
bold = 'C:/Windows/Fonts/arialbd.ttf'
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="white"/>', '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#334155" stroke-width="1.5"/></marker></defs>']
ink, line, blue = '#172b45', '#334155', '#c9eafb'

def label(x, y, text, size=19, color=ink, weight=False, width=30):
    lines = []
    for paragraph in text.split('\n'):
        lines.extend(textwrap.wrap(paragraph, width=width) or [''])
    font = ImageFont.truetype(bold if weight else regular, size)
    spacing = size + 6
    top = y - (len(lines) - 1) * spacing / 2
    for i, value in enumerate(lines):
        cy = top + i * spacing
        draw.text((x, cy), value, font=font, fill=color, anchor='mm')
        svg.append(f'<text x="{x}" y="{cy}" text-anchor="middle" dominant-baseline="central" font-family="Arial,sans-serif" font-size="{size}" font-weight="{700 if weight else 400}" fill="{color}">{escape(value)}</text>')

def rect(box, fill, outline=line, radius=0, stroke=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=stroke)
    x, y, r, b = box
    svg.append(f'<rect x="{x}" y="{y}" width="{r-x}" height="{b-y}" rx="{radius}" fill="{fill}" stroke="{outline}" stroke-width="{stroke}"/>')

def edge(points, text=None, at=None, dashed=False):
    if dashed:
        for a, b in zip(points, points[1:]):
            length = ((b[0]-a[0])**2 + (b[1]-a[1])**2)**.5
            for step in range(0, max(1, int(length)), 14):
                p = tuple(a[i] + (b[i]-a[i])*step/max(length,1) for i in (0,1))
                q = tuple(a[i] + (b[i]-a[i])*min(step+7,length)/max(length,1) for i in (0,1))
                draw.line((p,q), fill=line, width=2)
    else:
        draw.line(points, fill=line, width=2, joint='curve')
    a, b = points[-2:]
    import math
    theta = math.atan2(b[1]-a[1], b[0]-a[0])
    wings = [(b[0]-12*math.cos(theta+d), b[1]-12*math.sin(theta+d)) for d in (-.45,.45)]
    draw.line([wings[0],b,wings[1]], fill=line, width=2)
    svg.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in points)}" fill="none" stroke="{line}" stroke-width="2" stroke-linejoin="round" marker-end="url(#arrow)"'+(' stroke-dasharray="7 7"' if dashed else '')+'/>')
    if text:
        x,y=at
        font=ImageFont.truetype(bold,17)
        bounds=draw.textbbox((x,y),text,font=font,anchor='mm')
        rect((bounds[0]-6,bounds[1]-4,bounds[2]+6,bounds[3]+4),'white','white')
        label(x,y,text,17,weight=True,width=65)

centers = [246 + 333*i for i in range(6)]
nodes = {}
def action(key, lane, y, text, height=78, fill=blue):
    x=centers[lane]
    box=(x-137,y-height/2,x+137,y+height/2)
    rect(box,fill,radius=17)
    label(x,y,text,width=29)
    nodes[key]={'x':x,'y':y,'l':(box[0],y),'r':(box[2],y),'t':(x,box[1]),'b':(x,box[3])}

def decision(key,lane,y,text):
    x=centers[lane]; dx,dy=(120,56) if text else (16,16)
    points=[(x,y-dy),(x+dx,y),(x,y+dy),(x-dx,y)]
    draw.polygon(points,fill='#eef8fd',outline=line,width=2)
    svg.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in points)}" fill="#eef8fd" stroke="{line}" stroke-width="2"/>')
    if text: label(x,y,text,17,weight=True,width=18)
    nodes[key]={'x':x,'y':y,'l':(x-dx,y),'r':(x+dx,y),'t':(x,y-dy),'b':(x,y+dy)}

def connect(a,b,text=None,at=None):
    p,q=nodes[a]['b'],nodes[b]['t']
    mid=(p[1]+q[1])/2
    edge([p,(p[0],mid),(q[0],mid),q],text,at)

label(W/2,48,'SupportOps — End-to-End Issue Resolution',36,weight=True,width=100)
label(W/2,91,'Example: employee upload fails; investigation may require a product mapping fix.',21,width=130)
label(W/2,123,'Swimlanes show who acts. SupportOps records the work; technical remediation happens outside the app.',18,color='#536477',width=150)
names=['Customer','Technical Support\nAnalyst','Customer Success\nManager','Data Engineering','Product & Tech','SupportOps System']
for i,name in enumerate(names):
    x=80+333*i
    rect((x,160,x+333,3110),'#ffffff' if i%2==0 else '#fafcfe',outline='#9aa9b7',stroke=1)
    rect((x,160,x+333,222),'#e9f1f8',outline='#718399',stroke=1)
    label(x+166.5,191,name,21,weight=True,width=24)

draw.ellipse((234,242,258,266),fill='#111827')
svg.append('<circle cx="246" cy="254" r="12" fill="#111827"/>')
action('report',0,320,'Report issue and attach supporting evidence')
action('created',5,420,'Validate and save ticket\nStatus: Reported')
action('triage',1,520,'Assess impact / urgency; select one owner')
action('triaged',5,620,'Calculate priority; save owner / team\nStatus: Triaged',90)
action('start',1,730,'Start investigation\nStatus: Investigating')
action('ack',2,830,'Publish customer-safe acknowledgement / progress')
action('diagnose',3,930,'Review proof; optionally run approved sample checks')
decision('needinfo',3,1040,'More information needed?')
action('waiting',5,1150,'Save public question\nStatus: Waiting for Customer')
action('reply',0,1250,'Reply with requested information / evidence')
action('findings',3,1370,'Record findings and next action; choose visibility')
decision('product',3,1480,'Product change required?')
action('handoff',1,1590,'Assign Product & Tech\nStatus: Escalated')
action('datafix',3,1700,'Correct data / mapping externally; record Fix in Progress',94)
action('productfix',4,1700,'Reproduce and fix product externally; record Fix in Progress',94)
decision('merge',3,1810,'')
action('verify',3,1920,'Test recovery; record fix and verification evidence',90)
decision('complete',5,2040,'Verification and summary complete?')
action('resolved',5,2160,'Save restoration and resolution\nStatus: Resolved',90)
action('retest',2,2270,'Ask customer to retest and confirm recovery')
decision('recovered',0,2380,'Issue resolved?')
action('dispute',0,2490,'Dispute resolution; explain remaining failure')
action('confirm',0,2600,'Confirm resolution')
action('reopened',5,2600,'Save dispute; increment reopen count\nStatus: Investigating',90)
action('closed',5,2710,'Record customer confirmation\nStatus: Closed',90)

edge([(246,266),nodes['report']['t']])
for a,b in [('report','created'),('created','triage'),('triage','triaged'),('triaged','start'),('start','ack'),('ack','diagnose'),('diagnose','needinfo')]: connect(a,b)
edge([nodes['needinfo']['r'],(1911,1040),nodes['waiting']['t']],'Yes',(1565,1022))
connect('waiting','reply')
edge([nodes['reply']['b'],(30,1289),(30,881),(1245,881),nodes['diagnose']['t']],'Review new evidence',(618,881))
edge([nodes['needinfo']['l'],(1090,1040),(1090,1370),nodes['findings']['l']],'No',(1090,1130))
connect('findings','product')
edge([nodes['product']['l'],(579,1480),nodes['handoff']['t']],'Yes',(910,1460))
connect('handoff','productfix')
edge([nodes['product']['b'],nodes['datafix']['t']],'No',(1272,1580))
connect('datafix','merge')
edge([nodes['productfix']['b'],(1578,1760),(1245,1760),nodes['merge']['t']])
connect('merge','verify')
connect('verify','complete')
edge([nodes['complete']['r'],(2100,2040),(2100,1840),(1415,1840),(1415,1920),nodes['verify']['r']],'No — complete evidence',(1740,1840))
connect('complete','resolved','Yes',(1940,2110))
connect('resolved','retest')
connect('retest','recovered')
connect('recovered','dispute','No',(278,2440))
edge([nodes['recovered']['l'],(92,2380),(92,2600),nodes['confirm']['l']],'Yes',(92,2520))
connect('dispute','reopened')
edge([nodes['reopened']['r'],(2132,2600),(2132,870),(1245,870),nodes['diagnose']['t']],'Reopen: investigate and verify again',(1810,870))
connect('confirm','closed')
edge([nodes['closed']['b'],(1911,2800)])
draw.ellipse((1897,2800,1925,2828),outline='#111827',width=3)
draw.ellipse((1903,2806,1919,2822),fill='#111827')
svg.append('<circle cx="1911" cy="2814" r="14" fill="white" stroke="#111827" stroke-width="3"/><circle cx="1911" cy="2814" r="8" fill="#111827"/>')
label(1911,2850,'Incident lifecycle complete',17,weight=True,width=32)

# Independent follow-up is deliberately outside the main start/end flow.
rect((100,2890,2060,3090),'#f1f7fc',outline='#a2b7ca',radius=15,stroke=1)
label(1080,2915,'OPTIONAL FOLLOW-UP — does not block incident closure',20,weight=True,width=100)
label(550,2980,'Support / CSM: draft → review → approve → publish customer report',19,width=54)
label(1530,2980,'Technical teams: linked Problem → preventive improvement → evidence-based verification',19,width=57)
label(1080,3050,'A restored service can close with a verified workaround; permanent prevention may continue separately.',17,color='#536477',width=135)
label(1080,3140,'Solid arrows: activity flow     Diamonds: decisions / merge     Black circle: start     Ringed circle: end',18,width=140)
label(1080,3180,'CSM communications continue throughout. Specialist handoffs and sample diagnostics are used only when needed.',17,color='#536477',width=145)
svg.append('</svg>')
(OUT/'supportops-issue-activity.svg').write_text('\n'.join(svg),encoding='utf-8')
im.save(OUT/'supportops-issue-activity.png',dpi=(180,180))
print(OUT/'supportops-issue-activity.png')
