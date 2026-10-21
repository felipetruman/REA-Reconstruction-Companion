import re,json

def reference(data):
 if not isinstance(data,dict) or not isinstance(data.get('text'),str):return {'ok':False,'error':'TYPE'}
 text=data['text']
 if len(text)>512:return {'ok':False,'error':'SIZE'}
 parts=[x.strip() for x in text.split(';') if x.strip()]
 if len(parts)>8:return {'ok':False,'error':'COUNT'}
 items={}
 for part in parts:
  if part.count('=')!=1:return {'ok':False,'error':'PAIR'}
  key,value=[x.strip() for x in part.split('=')]
  if not re.fullmatch('[A-Za-z][A-Za-z0-9_]{0,7}',key):return {'ok':False,'error':'KEY'}
  if not re.fullmatch('[+-]?[0-9]{1,4}',value):return {'ok':False,'error':'NUMBER'}
  number=int(value)
  if abs(number)>999:return {'ok':False,'error':'RANGE'}
  items[key.upper()]=number
 ordered=sorted(items.items())
 return {'ok':True,'items':[[k,v] for k,v in ordered],'sum':sum(items.values()),'weight':sum((len(k)+1)*v for k,v in ordered)}
