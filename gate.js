// Gate Systems reuse the normalized inputs and point-in-time records produced by the backtest.
const GATE_STORAGE_KEY='nanovest-gate-systems-v1';
const gateActionLabels={pass:'Pass',fail:'Fail',block_buy:'Block BUY',allow_next:'Allow next rule',exclude_stock:'Exclude stock'};
const gateMissingLabels={skip:'Skip rule',pass:'Pass',fail:'Fail',yes:'Treat as Yes',no:'Treat as No'};
const gateOperatorLabels={gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'=',neq:'≠',contains:'contains',truthy:'is true'};
function gateParameterDescription(rule){
  const field=gateKey(rule.field),value=String(rule.threshold||'—');
  const labels={revenue_growth_yoy:'Revenue Growth YoY',net_income:'Net Income',close_above_sma_200:'Close > SMA 200',rsi:'RSI',volume_ratio:'Volume / Average Volume (20D)',catalyst_sentiment:'Catalyst Sentiment',analyst_consensus_rating:'Consensus Rating',spy_close_above_sma_200:'SPY Close > SPY SMA 200',critical_risk:'Critical Risk',average_daily_dollar_volume:'Average Daily Dollar Volume'};
  if(field==='close_above_sma_200'||field==='spy_close_above_sma_200')return`${labels[field]} is ${value}`;
  if(field==='critical_risk')return`${labels[field]} = ${value}`;
  if(field==='catalyst_sentiment')return`${labels[field]} = ${value}`;
  if(field==='revenue_growth_yoy')return`${labels[field]} ${gateOperatorLabels[rule.operator]||'='} ${value}${value==='—'||value.endsWith('%')?'':'%'}`;
  if(field==='volume_ratio')return`${labels[field]} ${gateOperatorLabels[rule.operator]||'='} ${value}${value==='—'||value.endsWith('×')?'':'×'}`;
  if(field==='average_daily_dollar_volume'){const amount=gateNumeric(value),formatted=amount===null?value:new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(amount);return`${labels[field]} ${gateOperatorLabels[rule.operator]||'='} $${formatted}`}
  return`${labels[field]||field.replaceAll('_',' ')} ${gateOperatorLabels[rule.operator]||'='} ${value}`;
}
const makeGateId=()=>`gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const gateClone=value=>JSON.parse(JSON.stringify(value));
const gateRule=(name,category,question,field,operator,threshold,expected,yesAction,noAction,groupId='core')=>({id:makeGateId(),enabled:true,name,category,question,field,operator,threshold:String(threshold),expected,yesAction,noAction,missing:'skip',groupId,joinWith:'and'});
const defaultGateSystem={
  id:'gate-balanced-default',name:'Balanced Gate',combineGroups:'and',minPassingGroups:1,
  groups:[
    {id:'core',name:'Core quality & trend',mode:'and',minPassing:1},
    {id:'risk',name:'Risk & eligibility',mode:'and',minPassing:1}
  ],
  rules:[
    gateRule('Positive revenue growth','Fundamental','Is revenue growth positive?','revenue_growth_yoy','gt','0','yes','pass','fail'),
    gateRule('Company profitable','Fundamental','Is the company profitable?','net_income','gt','0','yes','pass','fail'),
    gateRule('Above SMA 200','Technical','Is the closing price above SMA 200?','close_above_sma_200','eq','true','yes','pass','fail'),
    gateRule('Positive momentum','Technical','Is momentum positive?','rsi','gt','50','yes','pass','fail'),
    gateRule('Above-average volume','Technical','Is trading volume above average?','volume_ratio','gt','1.5','yes','pass','fail'),
    gateRule('Positive catalyst','Catalyst','Is the latest catalyst positive?','catalyst_sentiment','eq','positive','yes','pass','fail'),
    gateRule('Positive analyst consensus','Analyst','Is the analyst consensus positive?','analyst_consensus_rating','gte','60','yes','pass','fail'),
    gateRule('Benchmark uptrend','Market Regime','Is the benchmark in an uptrend?','spy_close_above_sma_200','eq','true','yes','pass','fail'),
    gateRule('Critical risk guard','Risk','Is there a critical risk condition?','critical_risk','eq','true','no','block_buy','allow_next','risk'),
    gateRule('Minimum liquidity','Eligibility','Is the stock sufficiently liquid?','average_daily_dollar_volume','gte','20000000','yes','pass','exclude_stock','risk')
  ]
};
function normalizeGateSystem(system){
  const next={...gateClone(defaultGateSystem),...(system||{})};
  next.id=String(system?.id||makeGateId());next.name=String(system?.name||'Gate System');
  next.groups=Array.isArray(system?.groups)&&system.groups.length?system.groups.map((group,index)=>({id:String(group.id||`group-${index+1}`),name:String(group.name||`Group ${index+1}`),mode:['and','or','at_least','custom'].includes(group.mode)?group.mode:'and',minPassing:Math.max(1,Number(group.minPassing)||1)})):gateClone(defaultGateSystem.groups);
  const groupIds=new Set(next.groups.map(group=>group.id));
  next.rules=(Array.isArray(system?.rules)?system.rules:gateClone(defaultGateSystem.rules)).map(rule=>({id:String(rule.id||makeGateId()),enabled:rule.enabled!==false,name:String(rule.name||'New gate question'),category:String(rule.category||'Custom'),question:String(rule.question||''),field:String(rule.field||''),operator:gateOperatorLabels[rule.operator]?rule.operator:'eq',threshold:String(rule.threshold??''),expected:rule.expected==='no'?'no':'yes',yesAction:gateActionLabels[rule.yesAction]?rule.yesAction:'pass',noAction:gateActionLabels[rule.noAction]?rule.noAction:'fail',missing:gateMissingLabels[rule.missing]?rule.missing:'skip',groupId:groupIds.has(String(rule.groupId))?String(rule.groupId):next.groups[0].id,joinWith:rule.joinWith==='or'?'or':'and'}));
  next.combineGroups=['and','or','at_least'].includes(next.combineGroups)?next.combineGroups:'and';next.minPassingGroups=Math.max(1,Number(next.minPassingGroups)||1);
  return next;
}
let gateSystems=(()=>{try{const stored=JSON.parse(localStorage.getItem(GATE_STORAGE_KEY)||'null');return Array.isArray(stored)&&stored.length?stored.map(normalizeGateSystem):[gateClone(defaultGateSystem)]}catch{return[gateClone(defaultGateSystem)]}})();
let activeGateSystem=gateSystems[0];
let editingGateRuleId=null;
function persistGateSystems(message='Saved locally'){
  localStorage.setItem(GATE_STORAGE_KEY,JSON.stringify(gateSystems));
  const status=$('#gate-system-status');if(status){status.textContent=message;status.className='status good'}
  renderGateSystemSelect();renderGateComparison();renderForwardGateResults();
}
function gateChanged(message='Saved locally'){
  activeGateSystem.name=$('#gate-system-name')?.value.trim()||activeGateSystem.name;
  const index=gateSystems.findIndex(system=>system.id===activeGateSystem.id);if(index>=0)gateSystems[index]=activeGateSystem;else gateSystems.push(activeGateSystem);
  persistGateSystems(message);renderGateGroups();renderGateRules();
}
function renderGateSystemSelect(){
  const select=$('#gate-system-select');if(!select)return;
  const options=gateSystems.map(system=>`<option value="${esc(system.id)}">${esc(system.name)}</option>`).join('');select.innerHTML=options;select.value=activeGateSystem.id;const backtestSelect=$('#backtest-gate-select');if(backtestSelect){backtestSelect.innerHTML=options;backtestSelect.value=activeGateSystem.id}const forwardSelect=$('#forward-gate-select');if(forwardSelect){forwardSelect.innerHTML=options;forwardSelect.value=activeGateSystem.id}
  $('#gate-system-name').value=activeGateSystem.name;$('#delete-gate-system').disabled=gateSystems.length<2;
}
function gateGroupModeText(mode){return({and:'AND — all rules pass',or:'OR — any rule passes',at_least:'Minimum passing rules',custom:'Custom AND / OR connectors'})[mode]||'AND — all rules pass'}
function renderGateGroups(){
  const container=$('#gate-groups');if(!container)return;
  container.innerHTML=activeGateSystem.groups.map(group=>`<div class="gate-group-row" data-group-row="${esc(group.id)}"><label>Group name<input type="text" maxlength="50" value="${esc(group.name)}" data-group-name="${esc(group.id)}"></label><label>Rule logic<select data-group-mode="${esc(group.id)}"><option value="and" ${group.mode==='and'?'selected':''}>AND — all rules pass</option><option value="or" ${group.mode==='or'?'selected':''}>OR — any rule passes</option><option value="at_least" ${group.mode==='at_least'?'selected':''}>Minimum passing rules</option><option value="custom" ${group.mode==='custom'?'selected':''}>Custom AND / OR connectors</option></select></label><label class="gate-group-min" ${group.mode==='at_least'?'':'hidden'}>Minimum rules<input type="number" min="1" step="1" value="${group.minPassing}" data-group-min="${esc(group.id)}"></label><button class="button secondary gate-remove-group" type="button" data-remove-group="${esc(group.id)}" ${activeGateSystem.groups.length===1?'disabled':''}>Remove group</button></div>`).join('');
  $$('[data-group-name]').forEach(input=>input.onchange=event=>{const group=activeGateSystem.groups.find(item=>item.id===event.target.dataset.groupName);if(!event.target.value.trim()){event.target.value=group.name;return toast('Enter a group name')}group.name=event.target.value.trim();gateChanged()});
  $$('[data-group-mode]').forEach(input=>input.onchange=event=>{const group=activeGateSystem.groups.find(item=>item.id===event.target.dataset.groupMode);group.mode=event.target.value;gateChanged()});
  $$('[data-group-min]').forEach(input=>input.onchange=event=>{const group=activeGateSystem.groups.find(item=>item.id===event.target.dataset.groupMin);group.minPassing=Math.max(1,Number(event.target.value)||1);event.target.value=group.minPassing;gateChanged()});
  $$('[data-remove-group]').forEach(button=>button.onclick=event=>{if(activeGateSystem.groups.length===1)return;const id=event.currentTarget.dataset.removeGroup,first=activeGateSystem.groups.find(group=>group.id!==id);activeGateSystem.groups=activeGateSystem.groups.filter(group=>group.id!==id);activeGateSystem.rules.forEach(rule=>{if(rule.groupId===id)rule.groupId=first.id});gateChanged()});
  const combine=$('#gate-group-combine');combine.value=activeGateSystem.combineGroups;$('#gate-min-groups').value=activeGateSystem.minPassingGroups;$('#gate-min-groups-wrap').hidden=activeGateSystem.combineGroups!=='at_least';
}
function renderGateRules(){
  const body=$('#gate-rule-rows');if(!body)return;
  const groupNames=Object.fromEntries(activeGateSystem.groups.map(group=>[group.id,group.name]));
  body.innerHTML=activeGateSystem.rules.map(rule=>`<tr class="${rule.enabled?'':'gate-rule-disabled'}"><td><label class="gate-toggle" aria-label="Enable ${esc(rule.name)}"><input type="checkbox" data-gate-enabled="${esc(rule.id)}" ${rule.enabled?'checked':''}><span></span></label></td><td><b>${esc(rule.name)}</b><small>${esc(rule.category)}</small></td><td class="gate-question-cell">${esc(rule.question||'—')}</td><td><code>${esc(gateParameterDescription(rule))}</code></td><td>${rule.expected==='yes'?'Yes':'No'}</td><td>${esc(gateActionLabels[rule.yesAction])}</td><td>${esc(gateActionLabels[rule.noAction])}</td><td>${esc(gateMissingLabels[rule.missing])}</td><td><span>${esc(groupNames[rule.groupId]||'—')}</span><small>Next: ${rule.joinWith.toUpperCase()}</small></td><td><div class="gate-row-actions"><button type="button" class="button secondary" data-edit-rule="${esc(rule.id)}">Edit</button><button type="button" class="button secondary" data-duplicate-rule="${esc(rule.id)}">Duplicate</button><button type="button" class="button secondary danger-button" data-delete-rule="${esc(rule.id)}">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="10" class="gate-empty">No questions yet. Add a question to define the Gate System.</td></tr>';
  $('#gate-rule-count').textContent=`${activeGateSystem.rules.length} rules · ${activeGateSystem.rules.filter(rule=>rule.enabled).length} enabled`;
  $$('[data-gate-enabled]').forEach(input=>input.onchange=event=>{const rule=activeGateSystem.rules.find(item=>item.id===event.target.dataset.gateEnabled);rule.enabled=event.target.checked;gateChanged()});
  $$('[data-edit-rule]').forEach(button=>button.onclick=event=>openGateRule(event.currentTarget.dataset.editRule));
  $$('[data-duplicate-rule]').forEach(button=>button.onclick=event=>{const source=activeGateSystem.rules.find(item=>item.id===event.currentTarget.dataset.duplicateRule);if(!source)return;const copy={...gateClone(source),id:makeGateId(),name:`${source.name} copy`};activeGateSystem.rules.splice(activeGateSystem.rules.indexOf(source)+1,0,copy);gateChanged('Duplicate saved locally')});
  $$('[data-delete-rule]').forEach(button=>button.onclick=event=>{activeGateSystem.rules=activeGateSystem.rules.filter(item=>item.id!==event.currentTarget.dataset.deleteRule);gateChanged('Question deleted')});
}
function fillGateEditorOptions(){
  $('#gate-edit-group').innerHTML=activeGateSystem.groups.map(group=>`<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');
  $('#gate-edit-yes-action').innerHTML=Object.entries(gateActionLabels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');$('#gate-edit-no-action').innerHTML=$('#gate-edit-yes-action').innerHTML;
  $('#gate-edit-missing').innerHTML=Object.entries(gateMissingLabels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
}
function openGateRule(id=null){
  editingGateRuleId=id;fillGateEditorOptions();const rule=id?activeGateSystem.rules.find(item=>item.id===id):{name:'',category:'Fundamental',question:'',field:'',operator:'gt',threshold:'0',expected:'yes',groupId:activeGateSystem.groups[0].id,yesAction:'pass',noAction:'fail',missing:'skip',joinWith:'and'};
  $('#gate-rule-dialog-title').textContent=id?'Edit gate question':'Add gate question';$('#gate-edit-name').value=rule.name;$('#gate-edit-category').value=rule.category;$('#gate-edit-question').value=rule.question;$('#gate-edit-field').value=rule.field;$('#gate-edit-operator').value=rule.operator;$('#gate-edit-threshold').value=rule.threshold;$('#gate-edit-expected').value=rule.expected;$('#gate-edit-group').value=rule.groupId;$('#gate-edit-yes-action').value=rule.yesAction;$('#gate-edit-no-action').value=rule.noAction;$('#gate-edit-missing').value=rule.missing;$('#gate-edit-logic').value=rule.joinWith;
  $('#gate-rule-dialog').showModal();
}
function saveGateRuleFromEditor(){
  const name=$('#gate-edit-name').value.trim(),question=$('#gate-edit-question').value.trim(),field=$('#gate-edit-field').value.trim();if(!name||!question||!field)return toast('Enter a rule name, question, and data field');
  const update={name,category:$('#gate-edit-category').value,question,field,operator:$('#gate-edit-operator').value,threshold:$('#gate-edit-threshold').value.trim(),expected:$('#gate-edit-expected').value,groupId:$('#gate-edit-group').value,yesAction:$('#gate-edit-yes-action').value,noAction:$('#gate-edit-no-action').value,missing:$('#gate-edit-missing').value,joinWith:$('#gate-edit-logic').value};
  if(editingGateRuleId){Object.assign(activeGateSystem.rules.find(rule=>rule.id===editingGateRuleId),update)}else activeGateSystem.rules.push({id:makeGateId(),enabled:true,...update});
  $('#gate-rule-dialog').close();gateChanged('Question saved locally');toast('Gate question saved');
}
function renderGateConfiguration(){renderGateSystemSelect();$('#gate-group-combine').value=activeGateSystem.combineGroups;renderGateGroups();renderGateRules();renderGateComparison();renderForwardGateResults()}

function gateKey(key){return String(key??'').toLowerCase().replace(/%/g,'_percent').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function gateMissing(value){return value===undefined||value===null||String(value).trim()===''}
function gateNumeric(value){if(typeof value==='number'&&Number.isFinite(value))return value;const match=String(value??'').trim().replace(/,/g,'').match(/^[+-]?(?:\d+\.?\d*|\.\d+)/);return match?Number(match[0]):null}
function gateBoolean(value){if(typeof value==='boolean')return value;const text=String(value??'').trim().toLowerCase();if(['true','yes','y','1','critical','high','positive','bullish'].includes(text))return true;if(['false','no','n','0','none','negative','bearish','low'].includes(text))return false;return null}
function analystConsensusFor(record){
  try{
    if(typeof analystRecords!=='undefined'&&Array.isArray(analystRecords)){
      const candidates=analystRecords.filter(item=>item.ticker===record.ticker),matches=record.date?candidates.filter(item=>String(item.date||'').slice(0,10)===String(record.date).slice(0,10)):candidates.length===1?candidates:[];
      if(matches.length===1&&Number.isFinite(Number(matches[0].composite)))return Number(matches[0].composite);
    }
    if(typeof analystUploads==='undefined'||!analystUploads.direction||!analystUploads.price||typeof rowsAsObjects!=='function'||typeof analystNumber!=='function')return undefined;
    const date=String(record.date||'').slice(0,10),directions=rowsAsObjects(analystUploads.direction.data),prices=rowsAsObjects(analystUploads.price.data);
    const tickerRows=(rows,kind)=>rows.filter(row=>String(row.ticker||row.symbol||'').trim().toUpperCase()===record.ticker&&(date?String(row.date||'').slice(0,10)===date:!row.date)).map(row=>({row,score:analystNumber(kind==='direction'?(row.direction_score??row.score??row.signal):(row.price_score??row.score??row.signal),kind)})).filter(item=>item.score!==null);
    const direction=tickerRows(directions,'direction'),price=tickerRows(prices,'price');if(direction.length!==1||price.length!==1)return undefined;
    const weights=typeof analystConfig!=='undefined'?analystConfig:{directionWeight:50,priceWeight:50};return (direction[0].score*Number(weights.directionWeight)+price[0].score*Number(weights.priceWeight))/100;
  }catch{return undefined}
}
function gateFieldValue(record,field){
  const key=gateKey(field),data=record.gateData||{},derived=data.derived||{};
  const aliases={revenue_growth_yoy:['revenue_growth_yoy','revenue_growth_yoy_percent','growth_revenue_yoy','growth_revenue_ttm_yoy'],net_income:['net_income','net_income_ttm','income_net_income'],close_above_sma_200:['close_above_sma_200'],spy_close_above_sma_200:['spy_close_above_sma_200'],rsi:['rsi','rsi_14'],volume_ratio:['volume_ratio'],catalyst_sentiment:['catalyst_sentiment','composite_catalyst_score','company_sentiment_score'],analyst_consensus_rating:['analyst_consensus_rating','consensus_rating'],critical_risk:['critical_risk','critical_risk_flag','is_critical_risk'],average_daily_dollar_volume:['average_daily_dollar_volume','avg_daily_dollar_volume','average_dollar_volume']};
  const candidates=aliases[key]||[key];
  for(const candidate of candidates){const normalized=gateKey(candidate);if(Object.hasOwn(derived,normalized)&&!gateMissing(derived[normalized]))return derived[normalized]}
  if(key==='fundamental_score')return record.fundamental;if(key==='technical_score')return record.technical;if(key==='catalyst_score')return record.catalyst;if(key==='composite_score')return record.composite;
  if(key==='analyst_consensus_rating'){const rating=analystConsensusFor(record);if(rating!==undefined)return rating}
  if(key==='close_above_sma_200'){
    const close=gateNumeric(gateFieldValue(record,'close')),sma=gateNumeric(gateFieldValue(record,'sma_200'));if(close!==null&&sma!==null)return close>sma;
  }
  if(key==='spy_close_above_sma_200'){
    const close=gateNumeric(gateFieldValue(record,'spy_close')),sma=gateNumeric(gateFieldValue(record,'spy_sma_200'));if(close!==null&&sma!==null)return close>sma;
  }
  if(key==='catalyst_sentiment'){
    const raw=lookupGateRaw(data,[...candidates,'event_impact_score','impact']);if(!gateMissing(raw)){const truth=gateBoolean(raw);if(truth!==null)return truth?'positive':'negative';const number=gateNumeric(raw);if(number!==null)return number>0?'positive':number<0?'negative':'neutral';const text=String(raw).toLowerCase();if(/positive|bullish|beat|upgrade/.test(text))return'positive';if(/negative|bearish|miss|downgrade/.test(text))return'negative'}
    const catalystText=Object.values(data.catalyst||{}).join(' ').toLowerCase();if(/positive|bullish|beat|upgrade/.test(catalystText))return'positive';if(/negative|bearish|miss|downgrade/.test(catalystText))return'negative';
  }
  const value=lookupGateRaw(data,candidates);if(!gateMissing(value))return value;
  if(key==='volume_ratio'){
    const volume=gateNumeric(gateFieldValue(record,'volume')),average=gateNumeric(gateFieldValue(record,'average_volume_20d'));if(volume!==null&&average>0)return volume/average;
  }
  if(key==='average_daily_dollar_volume'){
    const explicit=lookupGateRaw(data,candidates);if(!gateMissing(explicit))return explicit;
    const close=gateNumeric(gateFieldValue(record,'close')),volume=gateNumeric(gateFieldValue(record,'volume'));if(close!==null&&volume!==null)return close*volume;
  }
  return undefined;
}
function lookupGateRaw(data,keys){
  for(const bucket of ['fundamental','technical','catalyst','price','analyst','market','derived']){
    const row=data[bucket];if(!row||typeof row!=='object')continue;
    for(const [raw,value] of Object.entries(row)){if(keys.includes(gateKey(raw))&&!gateMissing(value))return value}
  }
  return undefined;
}
function gateCondition(value,operator,threshold){
  const expectedBoolean=gateBoolean(threshold),actualBoolean=gateBoolean(value),leftNumber=gateNumeric(value),rightNumber=gateNumeric(threshold);
  if(operator==='truthy')return actualBoolean===null?!gateMissing(value):actualBoolean;
  if(operator==='contains')return String(value).toLowerCase().includes(String(threshold).toLowerCase());
  if(operator==='eq'||operator==='neq'){
    const equal=actualBoolean!==null&&expectedBoolean!==null?actualBoolean===expectedBoolean:leftNumber!==null&&rightNumber!==null?leftNumber===rightNumber:String(value).trim().toLowerCase()===String(threshold).trim().toLowerCase();return operator==='eq'?equal:!equal;
  }
  if(leftNumber===null||rightNumber===null)return false;
  if(operator==='gt')return leftNumber>rightNumber;if(operator==='gte')return leftNumber>=rightNumber;if(operator==='lt')return leftNumber<rightNumber;if(operator==='lte')return leftNumber<=rightNumber;return false;
}
function evaluateGateRule(record,rule){
  let value=gateFieldValue(record,rule.field),answer,missing=gateMissing(value);
  if(missing){if(rule.missing==='skip')return{result:null,detail:'Skipped — data missing',rule};if(rule.missing==='pass')return{result:true,detail:'Passed — missing data set to pass',rule};if(rule.missing==='fail')return{result:false,detail:'Failed — missing data set to fail',rule};answer=rule.missing==='yes'}else answer=gateCondition(value,rule.operator,rule.threshold);
  const action=answer?rule.yesAction:rule.noAction,expected=rule.expected==='yes';let result;
  if(action==='block_buy')result=record.signal!=='Bullish';else if(action==='fail'||action==='exclude_stock')result=false;else result=answer===expected;
  const actionText=gateActionLabels[action];const answerText=answer?'Yes':'No';
  const detail=`${answerText} · expected ${expected?'Yes':'No'} · ${actionText}${action==='block_buy'&&record.signal==='Bullish'?' — Bullish signal blocked':''}`;
  return{result,detail,rule,answer,action,value};
}
function combineGateResults(results,mode,minPassing=1){
  const active=results.filter(result=>result!==null&&result!==undefined);if(!active.length)return null;
  if(mode==='or')return active.some(Boolean);if(mode==='at_least')return active.filter(Boolean).length>=Math.max(1,minPassing);return active.every(Boolean);
}
function evaluateGateGroup(record,system,group){
  const rules=system.rules.filter(rule=>rule.enabled&&rule.groupId===group.id),evaluated=rules.map(rule=>evaluateGateRule(record,rule)),active=evaluated.filter(result=>result.result!==null);
  if(!active.length)return{result:null,detail:`${group.name}: no available rule data`,rules:evaluated};
  let result;if(group.mode==='custom'){
    result=active[0].result;for(let index=1;index<active.length;index++){const connector=active[index-1].rule.joinWith;result=connector==='or'?(result||active[index].result):(result&&active[index].result)}
  }else result=combineGateResults(active.map(item=>item.result),group.mode,group.minPassing);
  const passed=active.filter(item=>item.result).length;
  return{result,detail:`${group.name}: ${passed}/${active.length} rules passed`,rules:evaluated};
}
function evaluateGateSystem(record,system){
  const groups=system.groups.map(group=>evaluateGateGroup(record,system,group)),active=groups.filter(group=>group.result!==null);
  const passed=combineGateResults(active.map(group=>group.result),system.combineGroups,system.minPassingGroups);
  const result=passed===null?true:passed;
  const failures=groups.filter(group=>group.result===false),details=failures.flatMap(group=>group.rules.filter(rule=>rule.result===false).map(rule=>`${rule.rule.name}: ${rule.detail}`));
  const detail=result?(active.length?groups.filter(group=>group.result).map(group=>group.detail).join(' · '):'No applicable data; skipped rules'):details.join(' · ')||'One or more rule groups did not pass';
  return{passed:result,detail,groups,rules:groups.flatMap(group=>group.rules)};
}
function gateStats(records){
  const evaluated=records.filter(record=>record.actual!==null&&Number.isFinite(Number(record.actual))),correct=evaluated.filter(record=>record.correct).length,active=evaluated.filter(record=>record.signal==='Bullish'||record.signal==='Bearish'),wins=active.filter(record=>record.correct).length,returns=evaluated.map(record=>Number(record.actual));
  const average=returns.length?returns.reduce((sum,value)=>sum+value,0)/returns.length:null;const compounded=returns.reduce((product,value)=>product*(1+value/100),1)-1;
  return{evaluated:records.length,accuracy:evaluated.length?`${Math.round(correct/evaluated.length*100)}%`:'—',winRate:active.length?`${Math.round(wins/active.length*100)}%`:'—',average:average===null?'—':`${average>0?'+':''}${average.toFixed(2)}%`,compounded:returns.length?`${compounded>=0?'+':''}${(compounded*100).toFixed(2)}%`:'—'};
}
let backtestResultMode='baseline';
function showBacktestResultMode(mode){
  backtestResultMode=mode==='gated'?'gated':'baseline';const baseline=backtestResultMode==='baseline';
  $('#baseline-results-tab').classList.toggle('active',baseline);$('#gated-results-tab').classList.toggle('active',!baseline);$('#baseline-results-tab').setAttribute('aria-selected',String(baseline));$('#gated-results-tab').setAttribute('aria-selected',String(!baseline));$('#baseline-results-panel').hidden=!baseline;$('#gated-results-panel').hidden=baseline;
}
function renderBacktestGateResults(){
  const summary=$('#backtest-results-comparison');if(!summary)return;
  if(!submittedRecords?.length){summary.innerHTML='<span class="muted">Run a backtest to compare baseline and gated results.</span>';$('#gated-metrics').innerHTML='';$('#gate-backtest-body').innerHTML='';return}
  const system=gateSystems.find(item=>item.id===activeGateSystem.id)||activeGateSystem,decisions=submittedRecords.map(record=>({record,result:evaluateGateSystem(record,system)})),kept=decisions.filter(item=>item.result.passed).map(item=>item.record),baselineStats=gateStats(submittedRecords),gatedStats=gateStats(kept);
  const delta=(before,after)=>{const a=gateNumeric(before),b=gateNumeric(after);if(a===null||b===null)return'No comparable outcomes';const difference=b-a;return`${difference>0?'+':''}${difference.toFixed(2)} percentage points`};
  summary.innerHTML=`<div class="backtest-compare-heading"><b>Baseline vs. ${esc(system.name)}</b><span>${kept.length} of ${submittedRecords.length} records kept · ${submittedRecords.length-kept.length} excluded</span></div><div class="backtest-compare-grid"><div><span>Signal accuracy</span><b>${baselineStats.accuracy} → ${gatedStats.accuracy}</b><small>${delta(baselineStats.accuracy,gatedStats.accuracy)}</small></div><div><span>Win rate</span><b>${baselineStats.winRate} → ${gatedStats.winRate}</b><small>${delta(baselineStats.winRate,gatedStats.winRate)}</small></div><div><span>Average return</span><b>${baselineStats.average} → ${gatedStats.average}</b><small>${delta(baselineStats.average,gatedStats.average)}</small></div></div>`;
  const evaluated=kept.filter(record=>record.actual!==null&&Number.isFinite(Number(record.actual))),active=evaluated.filter(record=>record.signal==='Bullish'||record.signal==='Bearish'),bullish=active.filter(record=>record.signal==='Bullish'),bearish=active.filter(record=>record.signal==='Bearish'),bullishWins=bullish.filter(record=>record.correct).length,bearishWins=bearish.filter(record=>record.correct).length;
  $('#gated-backtest-title').textContent=`${system.name} · Gate System results`;
  $('#gated-record-count').textContent=`${kept.length} kept · ${decisions.length-kept.length} rejected`;
  $('#gated-metrics').innerHTML=[
    ['Records kept',`${kept.length} / ${decisions.length}`,`${decisions.length-kept.length} rejected by the Gate System`],
    ['Overall Accuracy',gatedStats.accuracy,`${evaluated.filter(record=>record.correct).length} / ${evaluated.length} three-class matches`],
    ['Signal Win Rate',gatedStats.winRate,`${active.filter(record=>record.correct).length} / ${active.length} Bullish/Bearish only`],
    ['Bullish Win Rate',bullish.length?`${Math.round(bullishWins/bullish.length*100)}%`:'—',`${bullishWins} / ${bullish.length} Bullish signals`],
    ['Bearish Win Rate',bearish.length?`${Math.round(bearishWins/bearish.length*100)}%`:'—',`${bearishWins} / ${bearish.length} Bearish signals`],
    ['Average Return',gatedStats.average,`${evaluated.length} kept records with actual returns`]
  ].map(item=>`<div class="card metric"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join('');
  $('#gate-backtest-body').innerHTML=decisions.map(({record,result})=>`<tr class="${result.passed?'':'gate-rejected-row'}"><td>${esc(record.date||'—')}</td><td><b>${esc(record.ticker)}</b></td><td class="num">${Number(record.fundamental).toFixed(1)}</td><td class="num">${Number(record.technical).toFixed(1)}</td><td class="num">${Number(record.catalyst).toFixed(1)}</td><td class="num"><b>${Number(record.composite).toFixed(1)}</b></td><td><span class="signal ${String(record.signal||'neutral').toLowerCase()}">${esc(record.signal||'—')}</span></td><td><span class="result ${result.passed?'correct':'incorrect'}">${result.passed?'Kept':'Rejected'}</span></td><td class="gate-detail-cell">${esc(result.detail)}</td><td class="num">${record.actual!==null&&Number.isFinite(Number(record.actual))?`${Number(record.actual)>0?'+':''}${Number(record.actual).toFixed(2)}%`:'—'}</td><td>${record.actualSignal?`<span class="signal ${record.actualSignal.toLowerCase()}">${esc(record.actualSignal)}</span>`:'—'}</td><td><span class="result ${record.actual!==null?(record.correct?'correct':'incorrect'):'neutral'}">${record.actual!==null?(record.correct?'Correct':'Incorrect'):'Awaiting actual'}</span></td></tr>`).join('');
}
let forwardResultMode='baseline';
function showForwardResultMode(mode){
  forwardResultMode=mode==='gated'?'gated':'baseline';const baseline=forwardResultMode==='baseline';
  $('#forward-baseline-results-tab').classList.toggle('active',baseline);$('#forward-gated-results-tab').classList.toggle('active',!baseline);$('#forward-baseline-results-tab').setAttribute('aria-selected',String(baseline));$('#forward-gated-results-tab').setAttribute('aria-selected',String(!baseline));$('#forward-baseline-results-panel').hidden=!baseline;$('#forward-gated-results-panel').hidden=baseline;
}
function renderForwardGateResults(){
  const body=$('#forward-gate-evaluation-body');if(!body)return;
  if(!forwardRecords?.length){$('#forward-gated-metrics').innerHTML='';$('#forward-gated-record-count').textContent='';body.innerHTML='';return}
  const system=gateSystems.find(item=>item.id===activeGateSystem.id)||activeGateSystem,decisions=forwardRecords.map(record=>({record,result:evaluateGateSystem(record,system)})),kept=decisions.filter(item=>item.result.passed).length,rejected=decisions.length-kept;
  $('#forward-gate-results-title').textContent=`${system.name} · Forward signals`;
  $('#forward-gated-record-count').textContent=`${kept} kept · ${rejected} rejected`;
  $('#forward-gated-metrics').innerHTML=[['Tickers',decisions.length,'Matched across all three input files'],['Kept',kept,'Passed the selected Gate System'],['Rejected',rejected,'Failed the selected Gate System'],['Gate System',system.name,'Baseline scores and signals remain unchanged']].map(item=>`<div class="card metric"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join('');
  body.innerHTML=decisions.map(({record,result})=>`<tr class="${result.passed?'':'gate-rejected-row'}"><td><b>${esc(record.ticker)}</b></td><td class="num">${Number(record.fundamental).toFixed(1)}</td><td class="num">${Number(record.technical).toFixed(1)}</td><td class="num">${Number(record.catalyst).toFixed(1)}</td><td class="num"><b>${Number(record.composite).toFixed(1)}</b></td><td><span class="signal ${String(record.signal||'neutral').toLowerCase()}">${esc(record.signal||'—')}</span></td><td><span class="result ${result.passed?'correct':'incorrect'}">${result.passed?'Kept':'Rejected'}</span></td><td class="gate-detail-cell">${esc(result.detail)}</td></tr>`).join('');
}
function renderGateComparison(){
  const empty=$('#gate-comparison-empty'),wrap=$('#gate-comparison-wrap'),rows=$('#gate-comparison-rows'),decisionCard=$('#gate-decision-card');if(!empty||!wrap)return;renderBacktestGateResults();
  if(!submittedRecords?.length){empty.hidden=false;wrap.hidden=true;decisionCard.hidden=true;return}
  empty.hidden=true;wrap.hidden=false;
  const systems=gateSystems.map(system=>system.id===activeGateSystem.id?activeGateSystem:system);const unique=systems.filter((system,index,list)=>list.findIndex(item=>item.id===system.id)===index);
  const baseline=gateStats(submittedRecords),comparison=[{name:'Baseline · no gates',stats:baseline},...unique.map(system=>{const kept=submittedRecords.filter(record=>evaluateGateSystem(record,system).passed);return{name:system.name,stats:gateStats(kept),kept:kept.length}})];
  rows.innerHTML=comparison.map(item=>`<tr><td><b>${esc(item.name)}</b></td><td>${item.kept===undefined?`${submittedRecords.length}/${submittedRecords.length}`:`${item.kept}/${submittedRecords.length}`}</td><td>${item.stats.accuracy}</td><td>${item.stats.winRate}</td><td>${item.stats.average}</td><td>${item.stats.compounded}</td></tr>`).join('');
  const active=unique.find(system=>system.id===activeGateSystem.id)||activeGateSystem,decisions=submittedRecords.map(record=>({record,result:evaluateGateSystem(record,active)}));
  decisionCard.hidden=false;$('#gate-decision-title').textContent=`Gate decisions · ${active.name}`;$('#gate-decision-count').textContent=`${decisions.filter(item=>item.result.passed).length} kept · ${decisions.length} records`;
  $('#gate-decision-rows').innerHTML=decisions.map(({record,result})=>`<tr><td>${esc(record.date||'—')}</td><td><b>${esc(record.ticker)}</b></td><td><span class="signal ${String(record.signal||'neutral').toLowerCase()}">${esc(record.signal||'—')}</span></td><td><span class="result ${result.passed?'correct':'incorrect'}">${result.passed?'Kept':'Rejected'}</span></td><td class="gate-detail-cell">${esc(result.detail)}</td><td class="num">${record.actual!==null&&Number.isFinite(Number(record.actual))?`${Number(record.actual)>0?'+':''}${Number(record.actual).toFixed(2)}%`:'—'}</td></tr>`).join('');
}

// Keep gate comparisons in sync whenever the existing backtest renderer refreshes its records.
const renderEvaluationBeforeGate=renderEvaluation;
renderEvaluation=function(...args){const result=renderEvaluationBeforeGate(...args);renderGateComparison();return result};
const renderAnalystBeforeGate=renderAnalystResults;
renderAnalystResults=function(...args){const result=renderAnalystBeforeGate(...args);renderGateComparison();return result};
const renderForwardBeforeGate=renderForwardResults;
renderForwardResults=function(...args){const result=renderForwardBeforeGate(...args);renderForwardGateResults();return result};

$('#gate-system-select').onchange=event=>{activeGateSystem=gateSystems.find(system=>system.id===event.target.value)||gateSystems[0];renderGateConfiguration()};
$('#backtest-gate-select').onchange=event=>{activeGateSystem=gateSystems.find(system=>system.id===event.target.value)||gateSystems[0];renderGateConfiguration()};
$('#forward-gate-select').onchange=event=>{activeGateSystem=gateSystems.find(system=>system.id===event.target.value)||gateSystems[0];renderGateConfiguration()};
$('#gate-system-name').onchange=event=>{const name=event.target.value.trim();if(!name){event.target.value=activeGateSystem.name;return toast('Enter a Gate System name')}activeGateSystem.name=name;gateChanged()};
$('#save-gate-system').onclick=()=>{const name=$('#gate-system-name').value.trim();if(!name)return toast('Enter a Gate System name');activeGateSystem.name=name;persistGateSystems('Saved');toast('Gate System saved in this browser')};
$('#new-gate-system').onclick=()=>{const copy=gateClone(activeGateSystem);copy.id=makeGateId();copy.name=`${activeGateSystem.name} copy`;gateSystems.push(copy);activeGateSystem=copy;persistGateSystems('New system saved locally');renderGateConfiguration();toast('New Gate System created')};
$('#delete-gate-system').onclick=()=>{if(gateSystems.length<2)return toast('Keep at least one Gate System');if(!confirm(`Delete “${activeGateSystem.name}”?`))return;gateSystems=gateSystems.filter(system=>system.id!==activeGateSystem.id);activeGateSystem=gateSystems[0];persistGateSystems('System deleted');renderGateConfiguration();toast('Gate System deleted')};
$('#add-gate-group').onclick=()=>{const group={id:makeGateId(),name:`Group ${activeGateSystem.groups.length+1}`,mode:'and',minPassing:1};activeGateSystem.groups.push(group);gateChanged('Group added')};
$('#gate-group-combine').onchange=event=>{activeGateSystem.combineGroups=event.target.value;gateChanged()};
$('#gate-min-groups').onchange=event=>{activeGateSystem.minPassingGroups=Math.max(1,Number(event.target.value)||1);event.target.value=activeGateSystem.minPassingGroups;gateChanged()};
$('#add-gate-rule').onclick=()=>openGateRule();$('#gate-rule-form').onsubmit=event=>{event.preventDefault();saveGateRuleFromEditor()};$('#gate-rule-close').onclick=()=>$('#gate-rule-dialog').close();$('#gate-rule-cancel').onclick=()=>$('#gate-rule-dialog').close();
$('#refresh-gate-comparison').onclick=renderGateComparison;
$('#baseline-results-tab').onclick=()=>showBacktestResultMode('baseline');$('#gated-results-tab').onclick=()=>showBacktestResultMode('gated');
$('#forward-baseline-results-tab').onclick=()=>showForwardResultMode('baseline');$('#forward-gated-results-tab').onclick=()=>showForwardResultMode('gated');
renderGateConfiguration();
