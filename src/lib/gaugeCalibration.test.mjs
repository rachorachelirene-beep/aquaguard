import assert from 'node:assert/strict';
import test from 'node:test';
import {gaugeKeys,gaugeForm,gaugeEdits,saveGaugeCalibration,validatedLevel,currentLiveLevel} from './gaugeCalibration.js';

const settings = Object.fromEntries(gaugeKeys.map((key)=>[key,key==='gauge_enabled'?true:key==='gauge_points'?'reference':1]));

test('save then reload uses agent response and detects unsaved edits',async()=>{
  let saved;
  const request=async(path,options)=>{
    assert.equal(path,'/gauge_config');
    if(options){assert.equal(options.method,'PUT');saved=options.body;}
    return {settings:saved??settings};
  };
  const active=await saveGaugeCalibration(request,{...settings,SUPABASE_SECRET_KEY:'excluded'});
  assert.deepEqual(Object.keys(saved),gaugeKeys);
  const reloaded=gaugeForm(await request('/gauge_config'));
  assert.deepEqual(active,reloaded);
  assert.equal(gaugeEdits(reloaded,active),false);
  assert.equal(gaugeEdits({...reloaded,max_level_m:'4'},active),true);
});

test('failed or incomplete response never reports a saved active calibration',async()=>{
  await assert.rejects(saveGaugeCalibration(async()=>{throw new Error('unauthorized');},settings),/unauthorized/);
  await assert.rejects(saveGaugeCalibration(async()=>({settings:{}}),settings),/incomplete/);
});

const validated = {
  detected:true,camera_connected:true,calibration_valid:true,measurement_validated:true,level_m:1.2,
};

test('each validation flag must be explicitly true',()=>{
  for (const flag of ['detected','camera_connected','calibration_valid','measurement_validated']) {
    const missing = {...validated};
    delete missing[flag];
    assert.equal(validatedLevel(missing),null,`missing ${flag}`);
    for (const value of [undefined,null,false,1,'true'])
      assert.equal(validatedLevel({...validated,[flag]:value}),null,`${flag}: ${value}`);
  }
});

test('disconnected camera rejects a previously valid numeric reading',()=>{
  assert.equal(validatedLevel({...validated,camera_connected:false}),null);
});

test('unavailable or non-finite water levels never become numeric readings',()=>{
  assert.equal(validatedLevel(null),null);
  for (const level_m of [null,undefined,'',NaN,Infinity,'UNAVAILABLE'])
    assert.equal(validatedLevel({...validated,level_m}),null);
  assert.equal(validatedLevel({...validated,detected:false,level_m:0}),null);
});

test('genuine validated zero readings remain available for live and polling',()=>{
  const now = Date.parse('2026-10-12T00:00:00Z');
  for (const level_m of [0,'0.00']) {
    const detection = {...validated,level_m,station_id:7,detected_at:new Date(now).toISOString()};
    assert.equal(validatedLevel(detection),0);
    for (const transport of ['live','polling'])
      assert.equal(currentLiveLevel(detection,7,transport,now),0);
  }
});

test('stale and invalid timestamps reject otherwise fully validated readings',()=>{
  const now = Date.parse('2026-10-12T00:00:00Z');
  for (const detected_at of [new Date(now-30001).toISOString(),new Date(now+5001).toISOString(),null,undefined,'invalid'])
    for (const transport of ['live','polling'])
      assert.equal(currentLiveLevel({...validated,station_id:7,detected_at},7,transport,now),null);
});

test('current reading never uses history when live measurement is unavailable',()=>{
  const now = Date.parse('2026-10-12T00:00:00Z');
  const live = {...validated,station_id:7,detected_at:new Date(now).toISOString()};
  assert.equal(currentLiveLevel(live,7,'live',now),1.2);
  assert.equal(currentLiveLevel(live,'7','polling',now),1.2);
  for(const transport of ['unavailable','reconnecting'])
    assert.equal(currentLiveLevel(live,7,transport,now),null);
  assert.equal(currentLiveLevel(null,7,'live',now),null);
  assert.equal(currentLiveLevel({...live,detected:false,level_m:null},7,'live',now),null);
  assert.equal(currentLiveLevel(live,8,'live',now),null);
  assert.equal(currentLiveLevel(live,7,'live',now+31000),null);
  assert.equal(currentLiveLevel({...live,detected_at:null},7,'live',now),null);
});
