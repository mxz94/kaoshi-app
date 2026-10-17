import os, zipfile

SRC = r'D:\clean\2026-09-29-16-18-28\kaoshi-app\deploy-backend'
OUT = r'D:\clean\2026-09-29-16-18-28\kaoshi-app\deploy-backend.zip'

EXCLUDE = {'.env'}
EXCLUDE_DIRS = {'node_modules', '.git'}

if os.path.exists(OUT):
    os.remove(OUT)

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, SRC)
            if rel in EXCLUDE or rel.startswith('.env'):
                continue
            z.write(full, rel)

print('zipped', OUT)
# sanity
with zipfile.ZipFile(OUT) as z:
    names = z.namelist()
    print('entries:', len(names))
    print('has .env:', any(n == '.env' for n in names))
    with z.open('server.js') as fh:
        data = fh.read().decode('utf-8', 'replace')
        print('wechat-login in server.js:', data.count('wechat-login'))
