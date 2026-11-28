/* Reseller-Rechenbeispiel */
(function(){
  var n=document.getElementById('rs-n'),p=document.getElementById('rs-p');
  if(!n||!p)return;
  var o=document.getElementById('rs-n-out'),ein=document.getElementById('rs-ein'),plan=document.getElementById('rs-plan'),rest=document.getElementById('rs-rest');
  var f=new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
  function eur(x){return f.format(x)+' €'}
  function calc(){
    var k=+n.value||0,pr=Math.max(0,Math.min(9999,+p.value||0));
    var e=k*pr,pl=k<=10?297:397;
    o.textContent=k;
    ein.textContent=eur(e);
    plan.textContent=(k<=10?'Reseller 10':'Reseller Unlimited')+' · '+eur(pl);
    rest.textContent=(e-pl<0?'− ':'')+eur(Math.abs(e-pl));
  }
  n.addEventListener('input',calc);p.addEventListener('input',calc);calc();
})();
