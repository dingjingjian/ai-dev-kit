import zipfile, sys

z = zipfile.ZipFile('air-tycoon.zip')
bad = z.testzip()
print('testzip ->', bad, '(None = 全部 CRC 通过)')
names = z.namelist()
print('条目数:', len(names))
print('index.html 在根:', 'index.html' in names)
print('src/audio.js 在包:', 'src/audio.js' in names)
print('多套一层目录:', any(n.startswith('air-tycoon/') for n in names))
print('反斜杠路径:', [n for n in names if chr(92) in n])
print('全部条目:')
for n in sorted(names):
    print('   ', n, z.getinfo(n).file_size, 'bytes')
