import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,normalizeConfig} from '../shared/model.mjs';
import {sourceLabel,sourceIssues} from '../shared/source-status.mjs';
test('source failures identify the group and preserve the exact actionable reason',()=>{
  const c=defaults();c.groups[1].name='人氣提案';const issues=sourceIssues(c,[{status:'ok'},{status:'error',message:'D 欄票數必須是整數。',counts:null}]);
  assert.equal(issues.length,1);assert.equal(issues[0].message,'B 組｜人氣提案：D 欄票數必須是整數。');assert.equal(issues[0].retained,false);
});
test('retained values are stated only when a successful result exists, including zero votes',()=>{
  const c=defaults();assert.equal(sourceIssues(c,[{status:'stale',counts:{},message:'讀取逾時'}])[0].retained,true);
  assert.equal(sourceIssues(c,[{status:'waiting',counts:null}])[0].retained,false);
  assert.match(sourceIssues(c,[{status:'unconfigured'}])[0].message,/尚未填寫/);
});
test('single mode has no group prefix and successful states clear all issues',()=>{
  const c=defaults();c.mode='single';assert.equal(sourceLabel(c,0),'票源');assert.equal(sourceIssues(c,[{status:'error',message:'錯誤'}])[0].message,'票源：錯誤');assert.deepEqual(sourceIssues(c,[{status:'ok',counts:{甲:0}}]),[]);
});
test('all individual bar colors and geometry survive normalization without leaking to another candidate',()=>{
  const c=defaults(),d={barStart:'#123456',barEnd:'#654321',barTrack:'#abcdef',barTrackOpacity:65.5,barX:12.5};c.groups[1].candidates[2].design=d;
  const n=normalizeConfig(c);assert.deepEqual(n.groups[1].candidates[2].design,d);assert.deepEqual(n.groups[1].candidates[1].design,{});assert.notEqual(n.groups[1].card.barStart,d.barStart);
});
