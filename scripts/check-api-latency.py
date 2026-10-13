#!/usr/bin/env python3
"""A failing HTTP registration budget disproves the 2s UI budget.
A passing HTTP budget alone does not establish browser/end-to-end acceptance.
"""
import argparse,json,math,sys
parser=argparse.ArgumentParser();parser.add_argument('artifact');args=parser.parse_args()
data=json.load(open(args.artifact));samples=data.get('registrationSamples',[])
if len(samples)!=100 or any(s.get('status') not in(200,201)for s in samples):
 print('API signal unavailable: requires 100 successful registration samples');sys.exit(2)
latencies=sorted(float(s['elapsedMs'])for s in samples);p95=latencies[math.ceil(len(latencies)*.95)-1]
print(f'HTTP-only registration signal: P95={p95:.1f}ms, max={max(latencies):.1f}ms; browser acceptance remains separate')
sys.exit(0 if p95<=2000 else 1)
