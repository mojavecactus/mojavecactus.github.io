import re,sys
s=open('app-4.79.js').read()
routed=set(re.findall(r"return (fa2\w+)\(\);", s))
missing=[f for f in sorted(routed) if ('function %s('%f) not in s]
called=set(re.findall(r"\b(fa2[A-Z]\w*|kit[A-Z]\w*|cc[A-Z]\w*)\(", s))
defined=set(re.findall(r"function (fa2\w+|kit\w+|cc\w+)\(", s))
undef=[c for c in sorted(called) if c not in defined]
if missing or undef:
    print('FAIL missing:',missing,'undef:',undef); sys.exit(1)
print('INTEGRITY OK — %d routes, %d fn refs resolved'%(len(routed),len(called)))
