// Run against a local demo server: node scripts/smoke-phase2.mjs
// Creates one synthetic ticket and preserves its completed history.
const base=process.env.SUPPORTOPS_TEST_URL??'http://127.0.0.1:3000';
async function request(role,path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{cookie:`supportops-demo-role=${role}`,origin:base,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),redirect:'manual'});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {response,data};
}
function check(value,message){if(!value)throw new Error(message);console.log('PASS '+message);}
const created=await request('customer','/api/tickets','POST',{organization_id:'10000000-0000-4000-8000-000000000001',title:'Phase 2 acceptance: synthetic upload failed',description:'A synthetic employee feed is missing a required field. This is automated demo test evidence.',category:'Data Upload Failure',reported_urgency:'high'});
check(created.response.status===201,'customer ticket creation');const id=created.data.id;const path=`/api/tickets/${id}`;
check((await request('customer',path,'PATCH',{status:'Investigating'})).response.status===403,'customer cannot change investigation status');
check((await request('support_analyst',path,'PATCH',{status:'Investigating',explanation:'Reviewing the approved synthetic sample.'})).response.ok,'analyst starts investigation');
check((await request('support_analyst',path+'/updates','POST',{body:'INTERNAL_ACCEPTANCE_NOTE: verify schema before concluding cause.',visibility:'internal'})).response.ok,'analyst adds private note');
check((await request('support_analyst',path,'PATCH',{assigned_team:'Data Engineering',assigned_to:'20000000-0000-4000-8000-000000000004'})).response.ok,'analyst assigns Data Engineering');
check((await request('data_engineer',path,'PATCH',{status:'Fix in Progress'})).response.ok,'engineer updates investigation');
check((await request('customer_success',path,'PATCH',{status:'Resolved'})).response.status===403,'CSM cannot change investigation controls');
check((await request('customer_success',path+'/updates','POST',{body:'The team is correcting the synthetic upload mapping.',visibility:'public'})).response.ok,'CSM publishes customer update');
const privateFile=new FormData();privateFile.set('file',new Blob(['INTERNAL_ACCEPTANCE_EVIDENCE'],{type:'text/plain'}),'synthetic-investigation.txt');privateFile.set('visibility','internal');
check((await request('support_analyst',path+'/attachments','POST',privateFile)).response.status===201,'private evidence upload');
const publicFile=new FormData();publicFile.set('file',new Blob(['employee_id,status\nDEMO-001,active'],{type:'text/csv'}),'synthetic-sample.csv');publicFile.set('visibility','public');
check((await request('customer',path+'/attachments','POST',publicFile)).response.status===201,'customer evidence upload');
const customerView=await request('customer',path);const internalView=await request('support_analyst',path);
check(!JSON.stringify(customerView.data).includes('INTERNAL_ACCEPTANCE'),'customer response excludes private notes and evidence');
check(customerView.data.updates.some(update=>update.body.includes('correcting the synthetic')),'public progress reaches customer');
const internalFile=internalView.data.attachments.find(file=>file.visibility==='internal');
check((await request('customer',path+'/attachments/'+internalFile.id)).response.status===404,'private file download denied');
const customerFile=customerView.data.attachments[0];const download=await request('customer',path+'/attachments/'+customerFile.id);
check(download.response.ok&&download.data.includes('DEMO-001')&&download.response.headers.get('content-disposition').startsWith('attachment;'),'authorized attachment download');
const all=await request('support_analyst','/api/tickets');const other=all.data.find(ticket=>ticket.organization_name==='Northstar Logistics');
check(other&&(await request('customer',`/api/tickets/${other.id}`)).response.status===404,'other organization ticket denied');
const spoofed=new FormData();spoofed.set('file',new Blob(['<script>bad</script>']),'fake.png');
check((await request('customer',path+'/attachments','POST',spoofed)).response.status===400,'disguised upload rejected');
check((await request('data_engineer',path,'PATCH',{status:'Resolved',resolution_summary:'Synthetic schema mapping corrected and validated.'})).response.ok,'resolution persisted');
check((await request('customer',path+'/confirm','POST')).response.ok,'customer confirms resolution');
const final=await request('customer',path);check(final.data.ticket.status==='Closed'&&final.data.activity.length>=5,'closed ticket history preserved');
for(const url of ['/workspace','/workspace/tickets','/workspace/tickets/new',`/workspace/tickets/${id}`])check((await request('customer',url)).response.status===200,`customer screen ${url}`);
const html=await request('customer',`/workspace/tickets/${id}`);check(!html.data.includes('INTERNAL_ACCEPTANCE'),'server rendered customer page excludes private records');
check((await request('support_analyst',`/workspace/tickets/${id}`)).response.status===200,'internal investigation screen');
console.log(`\nCompleted synthetic acceptance ticket: ${base}/workspace/tickets/${id}`);
