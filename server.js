const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const app = express();
app.use(cors());
app.use(express.json());

const subscriptions = [
 {id:"SUB-10001",customer:"John Smith",plan:"Premium Coffee",amount:999,currency:"INR",frequency:"MONTHLY",status:"ACTIVE",nextBillingDate:"2026-10-12",paymentMethod:"•••• 4242"},
 {id:"SUB-10002",customer:"Priya Shah",plan:"Premium Coffee",amount:999,currency:"INR",frequency:"MONTHLY",status:"PAYMENT_RETRY",nextBillingDate:"2026-10-12",paymentMethod:"•••• 1111"},
 {id:"SUB-10003",customer:"Rahul Mehta",plan:"Daily Essentials",amount:499,currency:"INR",frequency:"MONTHLY",status:"PAUSED",nextBillingDate:"2026-10-15",paymentMethod:"•••• 2222"}
];
const payments = [
 {id:"PAY-10001",subscriptionId:"SUB-10001",amount:999,status:"SUCCESS",type:"CIT",message:"Initial payment"},
 {id:"PAY-10002",subscriptionId:"SUB-10002",amount:999,status:"DECLINED",type:"MIT",message:"Retryable decline"},
 {id:"PAY-10003",subscriptionId:"SUB-10003",amount:499,status:"UNKNOWN",type:"MIT",message:"PSP timeout"}
];
const events = [
 {time:"2026-09-12 10:00",subscriptionId:"SUB-10001",text:"Subscription created"},
 {time:"2026-09-12 10:01",subscriptionId:"SUB-10001",text:"Initial payment ₹999"},
 {time:"2026-09-12 10:02",subscriptionId:"SUB-10001",text:"3DS authentication: SUCCESS"},
 {time:"2026-09-12 10:03",subscriptionId:"SUB-10001",text:"Payment authorized"},
 {time:"2026-09-12 10:03",subscriptionId:"SUB-10001",text:"Subscription became ACTIVE"},
 {time:"2026-10-12 00:01",subscriptionId:"SUB-10001",text:"Scheduler identified billing cycle due"},
 {time:"2026-10-12 00:02",subscriptionId:"SUB-10001",text:"Recurring MIT payment triggered"},
 {time:"2026-10-12 00:02",subscriptionId:"SUB-10001",text:"3RI/authentication handling where applicable"}
];

app.get("/api/health",(req,res)=>res.json({status:"UP",service:"subscribe-n-save-backend"}));
app.get("/api/subscriptions",(req,res)=>res.json(subscriptions));
app.get("/api/subscriptions/:id/events",(req,res)=>res.json(events.filter(e=>e.subscriptionId===req.params.id)));

app.post("/api/payments/simulate",(req,res)=>{
 const {subscriptionId="SUB-10001", outcome="SUCCESS", amount=999, idempotencyKey} = req.body;
 const key = idempotencyKey || crypto.randomUUID();
 const existing = payments.find(p=>p.idempotencyKey===key);
 if(existing) return res.json({...existing,duplicate:true});
 const id = "PAY-SIM-"+crypto.randomUUID().slice(0,8).toUpperCase();
 const status = outcome;
 const payment = {id,subscriptionId,amount,status,type:"MIT",idempotencyKey:key,message:"Simulated PSP outcome"};
 payments.push(payment);
 if(status==="SUCCESS"){
   const s=subscriptions.find(x=>x.id===subscriptionId);
   if(s){s.status="ACTIVE"; s.nextBillingDate="2026-11-12";}
   events.push({time:new Date().toISOString(),subscriptionId,text:"Recurring payment SUCCESS; billing cycle PAID"});
 } else if(status==="DECLINED"){
   const s=subscriptions.find(x=>x.id===subscriptionId);
   if(s)s.status="PAYMENT_RETRY";
   events.push({time:new Date().toISOString(),subscriptionId,text:"Payment DECLINED; retry evaluation scheduled"});
 } else if(status==="UNKNOWN"){
   events.push({time:new Date().toISOString(),subscriptionId,text:"PSP TIMEOUT; payment UNKNOWN; duplicate charge blocked pending reconciliation"});
 }
 res.json({payment,webhook:{event:status==="SUCCESS"?"payment.authorized":"payment.status",payment_id:id,subscription_id:subscriptionId,status}});
});

app.post("/api/payments/:id/reconcile",(req,res)=>{
 const p=payments.find(x=>x.id===req.params.id);
 if(!p)return res.status(404).json({error:"Payment not found"});
 p.status="SUCCESS"; p.reconciled=true;
 const s=subscriptions.find(x=>x.id===p.subscriptionId);
 if(s)s.status="ACTIVE";
 events.push({time:new Date().toISOString(),subscriptionId:p.subscriptionId,text:"Reconciliation confirmed SUCCESS; billing cycle PAID; no duplicate charge"});
 res.json({payment:p,result:"SUCCESS",duplicateChargePrevented:true});
});

app.post("/api/subscriptions/:id/:action",(req,res)=>{
 const s=subscriptions.find(x=>x.id===req.params.id);
 if(!s)return res.status(404).json({error:"Subscription not found"});
 const map={pause:"PAUSED",resume:"ACTIVE",cancel:"CANCELLED"};
 if(!map[req.params.action])return res.status(400).json({error:"Unsupported action"});
 s.status=map[req.params.action];
 events.push({time:new Date().toISOString(),subscriptionId:s.id,text:`Subscription ${req.params.action.toUpperCase()} requested`});
 res.json(s);
});

app.get("/api/payments",(req,res)=>res.json(payments));
const PORT = process.env.PORT || 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});
