// Local synthetic demo only. Preserves its incident, reports, Problem and change history.
const base=process.env.SUPPORTOPS_TEST_URL??'http://127.0.0.1:3000';
async function call(role,path,method='GET',body){const response=await fetch(base+path,{method,headers:{origin:base,cookie:`supportops-demo-role=${role}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};}
function assert(ok,message){if(!ok)throw new Error(message);console.log('PASS '+message);}
async function save(role,id,input){const result=await call(role,`/api/tickets/${id}/case-records`,'POST',input);assert(result.status===201,`${input.kind??input.action}: ${input.status??''}`);return result.data;}
const stamp=Date.now();const customer='customer';const support='support_analyst';const engineer='data_engineer';const csm='customer_success';const product='product_tech';const owner='20000000-0000-4000-8000-000000000004';
const intake={organization_id:'10000000-0000-4000-8000-000000000001',title:`Study-case synthetic upload failure ${stamp}`,description:'The approved synthetic employee feed failed and the dashboard is stale.',category:'Data Upload Failure',reported_urgency:'high',business_impact:'The fictional reporting team cannot use the latest workforce snapshot.'};
const created=await call(customer,'/api/tickets','POST',intake);assert(created.status===201,'incident creation');const id=created.data.id;const path=`/api/tickets/${id}`;
await save(support,id,{kind:'triage',status:'Recorded',data:{record_type:'incident',impact:'high',urgency:'high',business_impact:intake.business_impact,owner_id:'20000000-0000-4000-8000-000000000002',major_incident:true,incident_lead:'Alex Morgan',update_cadence_minutes:15}});
assert((await call(customer,path)).data.ticket.priority==='critical','impact/urgency-derived critical priority');
assert((await call(customer,path+'/diagnostics','POST',{source_id:'missing',approved:true})).status===403,'customer diagnostic denial');
const diag=await call(support,path+'/diagnostics','POST',{source_id:'missing',approved:true,baseline:['employee_id','hire_date','employment_status']});assert(diag.status===200&&diag.data.summary.failed_checks>=1,'real Python diagnostic confirms missing employee_id');
assert(!JSON.stringify(diag.data).includes('DEMO-001'),'diagnostic summary has no raw employee values');
assert((await call(support,path,'PATCH',{status:'Resolved',resolution_summary:'Unverified claim'})).status===400,'unverified service recovery rejected');
await call(support,path,'PATCH',{status:'Investigating',assigned_team:'Data Engineering',assigned_to:owner});
const finding={hypothesis:'Source export mapping changed',reproduction_steps:'Run approved missing-column fixture',confirmed_cause:'Required employee_id column absent',evidence:'Python required_columns check failed on synthetic missing fixture',component:'workforce-import',error_code:'MISSING_EMPLOYEE_ID',cause_category:'schema',checklist:[{label:'Approved evidence reviewed',done:true}]};
await save(engineer,id,{kind:'investigation',status:'Recorded',data:finding});
await call(csm,path+'/updates','POST',{visibility:'public',body:'Our team found a sample validation issue and is checking a corrected export.'});
assert((await call(product,path+'/diagnostics','POST',{source_id:'valid',approved:true})).data.summary.failed_checks===0,'corrected synthetic sample passes Python validation');
await save(engineer,id,{kind:'restoration',status:'Verified',data:{restored_at:new Date().toISOString(),restoration_method:'Approved corrected export used as a verified workaround',verification_result:'Valid synthetic fixture accepted; refresh outcome checked',closure_evidence:'Python valid fixture run and recorded customer recovery check'}});
const problem=await save(support,id,{kind:'problem',status:'Open',data:{title:'Investigate recurring source mapping defect',incident_ids:[id],owner_id:owner,hypothesis:'Export mapping drift',confirmed_cause:'',evidence:'',known_error:'',workaround:'Validate and use corrected synthetic export',component:'workforce-import',error_code:'MISSING_EMPLOYEE_ID'}});
assert((await call(engineer,path,'PATCH',{status:'Resolved',resolution_summary:'Service restored using the approved export workaround. Permanent cause prevention remains tracked separately.'})).status===200,'resolve before Problem closure');
const drafts=await save(support,id,{action:'draft_reports'});const customerReport=drafts.find(record=>record.data.audience==='customer');const internalReport=drafts.find(record=>record.data.audience==='internal');
assert((await call(customer,`/api/reports/${customerReport.id}/pdf`)).status===404,'customer draft PDF denied');
assert((await call(customer,`/api/reports/${internalReport.id}/pdf`)).status===404,'internal technical report denied');
const approved=await save(csm,id,{id:customerReport.id,version:customerReport.version,kind:'report',status:'Approved',data:{...customerReport.data,review_notes:'Reviewed source facts, verification and customer-safe wording; no raw records or private notes.'}});
const published=await save(csm,id,{id:approved.id,version:approved.version,kind:'report',status:'Published',data:approved.data});
const pdf=await call(customer,`/api/reports/${published.id}/pdf`);assert(pdf.status===200&&pdf.headers.get('content-type')==='application/pdf'&&pdf.data.startsWith('%PDF'),'published customer PDF available');
assert((await call(customer,path+'/case-records?history=1')).status===403,'private version history denied');
assert((await call(customer,path+'/confirm','POST')).status===200,'incident closes independently from open Problem');
const actionData={title:'Implement pre-upload schema preflight',problem_id:problem.id,owner_id:owner,acceptance_criteria:'Reject missing identifier before processing; accept valid fixture',implementation_evidence:'',verification_evidence:'',baseline:'',review_date:'2026-11-15'};
let action=await save(support,id,{kind:'improvement',status:'Proposed',data:actionData});
for(const [state,role]of[['Approved',csm],['In Progress',engineer],['Implemented',engineer],['Monitoring',engineer]]){if(state==='Implemented')actionData.implementation_evidence='Product & Tech and Engineering validated preflight test cases';if(state==='Monitoring')actionData.baseline='Compare approved fixture outcomes over the next review window';action=await save(role,id,{id:action.id,version:action.version,kind:'improvement',status:state,data:actionData});}
assert((await call(csm,path+'/case-records','POST',{id:action.id,version:action.version,kind:'improvement',status:'Verified',data:actionData})).status===400,'verification without follow-up evidence rejected');
actionData.verification_evidence='Reviewer checked both valid and invalid fixture acceptance criteria';await save(csm,id,{id:action.id,version:action.version,kind:'improvement',status:'Verified',data:actionData});
const repeated=await call(customer,'/api/tickets','POST',{...intake,title:`Study-case repeated synthetic failure ${stamp}`});await save(engineer,repeated.data.id,{kind:'investigation',status:'Recorded',data:finding});
const planned=await call(customer,'/api/tickets','POST',{...intake,title:`Study-case planned SSO onboarding ${stamp}`,category:'Login / SSO Issue',record_type:'service_request'});assert((await call(customer,`/api/tickets/${planned.data.id}`)).data.ticket.record_type==='service_request','planned SSO routed as service request');
const customerRecords=(await call(customer,path+'/case-records')).data;assert(customerRecords.length===1&&customerRecords[0].id===published.id,'customer receives only published customer report');
const hub=await call(support,'/workspace/learning');assert(hub.status===200&&hub.data.includes('Required employee_id column absent'),'recurrence analytics links matching verified incidents');
assert((await call(customer,path)).data.ticket.status==='Closed','improvement work does not reopen closed incident');
console.log(`\nStudy-case demo ready: ${base}/workspace/tickets/${id}`);
