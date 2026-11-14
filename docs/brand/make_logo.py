# Draws the AstroPulse logo files (SVG) from a few numbers. Run:  python docs/brand/make_logo.py
# PNGs for the web app (icons, social card): node docs/brand/export-png.mjs web/public   (needs: npm i sharp)
import math, json, os
OUT = os.path.dirname(os.path.abspath(__file__))  # writes next to this script

# --- geometry: a tilted orbit ring, open at the upper left, with a heartbeat line crossing it and a small sun on the ring
CX, CY, RX, RY, PHI = 64.0, 67.0, 47.0, 33.5, math.radians(-20)

def P(theta_deg):
    t = math.radians(theta_deg)
    x, y = RX * math.cos(t), RY * math.sin(t)
    return (CX + x * math.cos(PHI) - y * math.sin(PHI), CY + x * math.sin(PHI) + y * math.cos(PHI))

def arc(t0, t1, sweep=1, large=0):
    (x0, y0), (x1, y1) = P(t0), P(t1)
    return f"M{x0:.2f} {y0:.2f} A{RX} {RY} {math.degrees(PHI):.1f} {large} {sweep} {x1:.2f} {y1:.2f}"

main_arc = arc(172, 326, sweep=0, large=1)   # left -> bottom -> right -> top right (thick; angles run clockwise on screen, so going through the bottom means decreasing)
thin_arc = arc(238, 322, sweep=1, large=0)   # the upper side of the orbit (thin, lighter)
sun = P(326)

# heartbeat line (white-blue), lead-in tail from the left, spikes, and a tail up to the right
pulse = "M40 68.2 L46 66.8 L51 56 L58 83 L67 40 L75 70 L84 60 L95 49"
tail_wedge = "M4 76 L40 65.6 L40 70.8 Z"
streak = "M90 50 L100 42"

def mark(defs_id=''):
    p = defs_id
    return f'''<defs>
    <linearGradient id="ring{p}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f7df6"/><stop offset="1" stop-color="#6ea8ff"/></linearGradient>
    <linearGradient id="sun{p}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#ff9f2e"/></linearGradient>
  </defs>
  <path d="{main_arc}" fill="none" stroke="url(#ring{p})" stroke-width="6.4" stroke-linecap="round"/>
  <path d="{thin_arc}" fill="none" stroke="#6ea8ff" stroke-opacity="0.75" stroke-width="2" stroke-linecap="round"/>
  <path d="{tail_wedge}" fill="#eaf1ff"/>
  <path d="{pulse}" fill="none" stroke="#eaf1ff" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="{streak}" fill="none" stroke="#eaf1ff" stroke-width="2" stroke-linecap="round"/>
  <circle cx="{sun[0]:.2f}" cy="{sun[1]:.2f}" r="7.4" fill="url(#sun{p})"/>'''

def mono(color, bg=None):
    s = f'''<path d="{main_arc}" fill="none" stroke="{color}" stroke-width="6.4" stroke-linecap="round"/>
  <path d="{thin_arc}" fill="none" stroke="{color}" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round"/>
  <path d="{tail_wedge}" fill="{color}"/>
  <path d="{pulse}" fill="none" stroke="{color}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="{streak}" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="{sun[0]:.2f}" cy="{sun[1]:.2f}" r="7.4" fill="{color}"/>'''
    return s

def write(name, text):
    open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n').write(text)

# 1) the mark on a transparent background (for dark backgrounds)
write('logo-mark.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="AstroPulse">\n  {mark()}\n</svg>\n')

# 2) app icon: rounded dark-navy square, mark scaled into the safe area
def app_icon(bg_top, bg_bottom, inner):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="AstroPulse">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg_top}"/><stop offset="1" stop-color="{bg_bottom}"/></linearGradient></defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <g transform="translate(64 64) scale(0.82) translate(-64 -66)">
  {inner}
  </g>
</svg>
'''
write('app-icon.svg', app_icon('#101a3a', '#070c1d', mark('a')))
write('app-icon-light.svg', app_icon('#ffffff', '#e8eeff', mark('b').replace('#eaf1ff', '#0b1a44')))

# 3) mono versions
write('logo-mono-white.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="AstroPulse">\n  {mono("#ffffff")}\n</svg>\n')
write('logo-mono-black.svg', f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="AstroPulse">\n  {mono("#0b1020")}\n</svg>\n')

# 4) maskable icon for Android (the mark inside the 80% safe zone, full-bleed background)
write('icon-maskable.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a3a"/><stop offset="1" stop-color="#070c1d"/></linearGradient></defs>
  <rect width="128" height="128" fill="url(#bg)"/>
  <g transform="translate(64 64) scale(0.62) translate(-64 -66)">
  {mark('m')}
  </g>
</svg>
''')

write('icon-square.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a3a"/><stop offset="1" stop-color="#070c1d"/></linearGradient></defs>
  <rect width="128" height="128" fill="url(#bg)"/>
  <g transform="translate(64 64) scale(0.8) translate(-64 -66)">
  {mark('q')}
  </g>
</svg>
''')

# 5) social card 1200x630: mark + wordmark + tagline on the dark background
write('og.svg', f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.3" cy="0.4" r="0.9"><stop offset="0" stop-color="#16265a"/><stop offset="1" stop-color="#070c1d"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g fill="#ffffff" fill-opacity="0.55"><circle cx="90" cy="70" r="1.6"/><circle cx="240" cy="560" r="1.4"/><circle cx="1090" cy="90" r="1.8"/><circle cx="980" cy="540" r="1.3"/><circle cx="600" cy="40" r="1.2"/><circle cx="1150" cy="330" r="1.4"/></g>
  <g transform="translate(110 150) scale(2.7)">{mark('o')}</g>
  <text x="520" y="318" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="128" font-weight="800" fill="#ffffff">Astro<tspan fill="#6ea8ff">Pulse</tspan></text>
  <text x="526" y="388" font-family="IBM Plex Mono, Consolas, monospace" font-size="34" letter-spacing="14" fill="#93a0cf">NORMAL, FOR YOU.</text>
  <text x="526" y="466" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="30" fill="#e6eaff" fill-opacity="0.85">Health monitoring for astronauts,</text>
  <text x="526" y="508" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="30" fill="#e6eaff" fill-opacity="0.85">learned from each person's own baseline.</text>
  <text x="526" y="580" font-family="IBM Plex Mono, Consolas, monospace" font-size="22" letter-spacing="6" fill="#6ea8ff">SPACE MONKEYS · NASA SPACE APPS 2026</text>
</svg>
''')
print('geometry ok; sun at', [round(v, 1) for v in sun])
