import{r as Ie,A as Ne,R as E,s as Qc,c as Yc,u as Xc}from"./api-CVvIlZn0.js";var Ts={exports:{}},jn={};/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Po;function Jc(){if(Po)return jn;Po=1;var n=Symbol.for("react.transitional.element"),e=Symbol.for("react.fragment");function t(r,s,o){var a=null;if(o!==void 0&&(a=""+o),s.key!==void 0&&(a=""+s.key),"key"in s){o={};for(var c in s)c!=="key"&&(o[c]=s[c])}else o=s;return s=o.ref,{$$typeof:n,type:r,key:a,ref:s!==void 0?s:null,props:o}}return jn.Fragment=e,jn.jsx=t,jn.jsxs=t,jn}var xo;function Zc(){return xo||(xo=1,Ts.exports=Jc()),Ts.exports}var re=Zc();function Vo(){const n=new Date,e=n.getFullYear(),t=String(n.getMonth()+1).padStart(2,"0"),r=`bk_id_counter_${e}${t}`;let s=1;try{const a=localStorage.getItem(r);a&&(s=parseInt(a,10)+1)}catch{}try{localStorage.setItem(r,s.toString())}catch{}const o=String(s).padStart(5,"0");return`BK${e}${t}${o}`}const ws=["pdf","png","jpg","jpeg","dxf","dwg","step","stp","iges","igs"],Do=1.5;function ko(n){const e=n.lastIndexOf(".");return e>=0?n.slice(e+1).toLowerCase():""}function eu(n){return new Promise((e,t)=>{const r=new FileReader;r.onload=()=>e(r.result),r.onerror=t,r.readAsDataURL(n)})}function tu(n){const e=(n||"").toLowerCase();return e.startsWith("image/")||["png","jpg","jpeg"].includes(e)}function Qa(n,e="TL"){return`₺${(typeof n=="number"?n:parseFloat(n)||0).toFixed(2)}`}const No=["Backspace","Delete","Tab","Enter","Escape","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"],Tr=[{id:"name",label:"Müşteri Adı",type:"text",required:!0},{id:"company",label:"Şirket",type:"text",required:!1},{id:"proj",label:"Proje Adı",type:"text",required:!0},{id:"phone",label:"Telefon",type:"phone",required:!0},{id:"email",label:"E-posta",type:"email",required:!0}];function nu({onSubmit:n,initialData:e=null,showNotification:t,t:r}){const[s,o]=Ie.useState(!0),[a,c]=Ie.useState(!1),[h,d]=Ie.useState(null),[p,m]=Ie.useState(()=>({...e||{},customFields:e&&e.customFields||{}})),[I,R]=Ie.useState({}),[L,z]=Ie.useState(!1),[F,X]=Ie.useState({}),[oe,ie]=Ie.useState(!1),[xe,Se]=Ie.useState(null),[me,w]=Ie.useState([]);Ie.useEffect(()=>{console.log("🔧 DynamicFormRenderer: Component mounted")},[]),Ie.useEffect(()=>{console.log("🔥 FormData state updated:",p),window.formDataState=p},[p]),Ie.useEffect(()=>{g()},[]),Ie.useEffect(()=>{e&&m({...e,customFields:e.customFields||{}})},[e]);async function g(){console.log("🔧 DynamicFormRenderer: Loading form config...");try{o(!0);const C=await Ne.getFormConfig();console.log("🔧 DynamicFormRenderer: Form config loaded successfully"),d(C.formConfig)}catch(C){console.error("🔧 DynamicFormRenderer: Load form config error:",C),t("Form konfigürasyonu yüklenemedi","error")}finally{o(!1),console.log("🔧 DynamicFormRenderer: Loading completed")}}async function _(C,M,O=!1){z(!0);try{const x=[];for(const $ of Array.from(M)){const ce=ko($.name);if(!ws.includes(ce)){t(`Desteklenmeyen dosya türü: ${ce}`,"error");continue}if($.size>Do*1024*1024){t(`Dosya çok büyük: ${$.name} (max ${Do}MB)`,"error");continue}const ae=await eu($);x.push({name:$.name,size:$.size,type:$.type,dataUrl:ae})}x.length>0&&(b(C,x,O),t(`${x.length} dosya yüklendi`,"success"))}catch(x){console.error("File upload error:",x),t("Dosya yükleme hatası","error")}finally{z(!1)}}function T(C,M){const O=C.type,x=C.validation||{},$=[];if(!M||M.toString().trim()==="")return C.required?{isValid:!1,error:"Bu alan zorunludur"}:{isValid:!0,error:null};switch(O){case"number":if(!/^-?\d*\.?\d*$/.test(M))return{isValid:!1,error:"Sadece sayısal değer girebilirsiniz"};const ce=parseFloat(M);if(isNaN(ce))return{isValid:!1,error:"Geçerli bir sayı giriniz"};x.min!==void 0&&ce<x.min&&$.push(`Minimum değer: ${x.min}`),x.max!==void 0&&ce>x.max&&$.push(`Maximum değer: ${x.max}`),x.integer&&!Number.isInteger(ce)&&$.push("Tam sayı giriniz (ondalık kullanmayın)"),x.positive&&ce<=0&&$.push("Pozitif bir sayı giriniz");break;case"email":if(!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(M))return{isValid:!1,error:"Geçerli bir e-posta adresi giriniz (örn: ornek@email.com)"};if(x.allowedDomains&&x.allowedDomains.length>0){const he=M.split("@")[1];x.allowedDomains.includes(he)||$.push(`Sadece şu domainler kabul edilir: ${x.allowedDomains.join(", ")}`)}break;case"phone":const et=M.replace(/[\s\-\(\)]/g,"");if(![/^(\+90|90)?[5][0-9]{9}$/,/^(\+90|90|0)?[2-4][0-9]{9}$/].some(he=>he.test(et)))return{isValid:!1,error:"Geçerli bir telefon numarası giriniz (örn: +90 555 123 45 67 veya 0212 123 45 67)"};break;case"text":x.minLength&&M.length<x.minLength&&$.push(`En az ${x.minLength} karakter giriniz`),x.maxLength&&M.length>x.maxLength&&$.push(`En fazla ${x.maxLength} karakter girebilirsiniz`),x.onlyLetters&&!/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/.test(M)&&$.push("Sadece harf girebilirsiniz"),x.noNumbers&&/\d/.test(M)&&$.push("Sayı karakteri kullanamaz"),x.alphanumeric&&!/^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]+$/.test(M)&&$.push("Sadece harf ve sayı kullanabilirsiniz"),x.pattern&&(new RegExp(x.pattern).test(M)||$.push(x.patternMessage||"Geçersiz format"));break;case"textarea":x.minLength&&M.length<x.minLength&&$.push(`En az ${x.minLength} karakter giriniz`),x.maxLength&&M.length>x.maxLength&&$.push(`En fazla ${x.maxLength} karakter girebilirsiniz`),x.minWords&&M.trim().split(/\s+/).length<x.minWords&&$.push(`En az ${x.minWords} kelime giriniz`),x.maxWords&&M.trim().split(/\s+/).length>x.maxWords&&$.push(`En fazla ${x.maxWords} kelime girebilirsiniz`);break;case"date":const ge=new Date(M);if(isNaN(ge.getTime()))return{isValid:!1,error:"Geçerli bir tarih giriniz"};x.futureOnly&&ge<=new Date&&$.push("Gelecekteki bir tarih seçiniz"),x.pastOnly&&ge>=new Date&&$.push("Geçmişteki bir tarih seçiniz"),x.minDate&&ge<new Date(x.minDate)&&$.push(`En erken ${x.minDate} tarihi seçebilirsiniz`),x.maxDate&&ge>new Date(x.maxDate)&&$.push(`En geç ${x.maxDate} tarihi seçebilirsiniz`);break;case"dropdown":case"radio":if(C.options&&!C.options.includes(M))return{isValid:!1,error:"Geçerli bir seçenek seçiniz"};break;case"multiselect":case"checkbox":x.minSelections&&Array.isArray(M)&&M.length<x.minSelections&&$.push(`En az ${x.minSelections} seçenek seçiniz`),x.maxSelections&&Array.isArray(M)&&M.length>x.maxSelections&&$.push(`En fazla ${x.maxSelections} seçenek seçebilirsiniz`);break;case"file":M&&typeof M=="object"&&M.size&&(x.maxSize&&M.size>x.maxSize&&$.push(`Dosya boyutu en fazla ${(x.maxSize/(1024*1024)).toFixed(1)} MB olabilir`),x.allowedTypes&&!x.allowedTypes.includes(M.type)&&$.push(`Sadece şu dosya türleri kabul edilir: ${x.allowedTypes.join(", ")}`));break}return{isValid:$.length===0,error:$.length>0?$[0]:null}}function v(C,M){return C}function b(C,M,O=!1,x=null){console.log("🚀 handleFieldChange called:",{fieldId:C,value:M,isCustomField:O,fieldType:x?.type});const $=O?p.customFields?.[C]:p[C];$!==M&&console.log("🔥 Field value changed:",{fieldId:C,oldValue:$,newValue:M});let ce=M;if(x&&(ce=v(M)),m(O?ae=>({...ae,customFields:{...ae.customFields,[C]:ce}}):ae=>({...ae,[C]:ce})),x){const ae=T(x,ce);R(et=>{const we={...et};return ae.isValid?delete we[C]:we[C]=ae.error,we})}}function y(){const C={},M=h?.fields||h?.formStructure?.fields||[];return[...Tr,...M].forEach(x=>{const ce=!Tr.some(et=>et.id===x.id)?p.customFields?.[x.id]:p[x.id],ae=T(x,ce);ae.isValid||(C[x.id]=ae.error)}),R(C),Object.keys(C).length===0}async function ve(C){if(C.preventDefault(),!y()){t("Lütfen form hatalarını düzeltin","error");return}try{c(!0);const O={id:Vo(),createdAt:new Date().toISOString(),status:"new",name:p.name,company:p.company,proj:p.proj,phone:p.phone,email:p.email,customFields:p.customFields||{},formVersion:h?.version,formConfigSnapshot:h};await n(O),t("Teklif başarıyla gönderildi!","success"),m({customFields:{}}),R({})}catch(O){console.error("Submit error:",O),t("Form gönderilemedi. Lütfen tekrar deneyin.","error")}finally{c(!1)}}if(s)return E.createElement("div",{className:"loading-state"},E.createElement("div",{style:{textAlign:"center",padding:"40px"}},E.createElement("p",null,"Form yükleniyor..."),E.createElement("p",{style:{fontSize:"12px",color:"#666"}},"Form konfigürasyonu API'den alınıyor...")));if(!s&&!h)return E.createElement("div",{className:"error-state"},E.createElement("div",{style:{textAlign:"center",padding:"40px"}},E.createElement("p",{style:{color:"red"}},"Form konfigürasyonu yüklenemedi"),E.createElement("p",{style:{fontSize:"12px",color:"#666"}},"Lütfen sayfayı yenileyin veya admin ile iletişime geçin.")));function Ke(C,M=!1){const O=C.id,x=M?p.customFields?.[O]:p[O],$=I[O],ce=F[O],ae=x?T(C,x):null,et=!!(x&&ae&&ae.isValid),we={id:O,name:O,"data-field-id":O,className:$?"error":ce?"warning":x?"valid":"",tabIndex:0,autoComplete:"off",onChange:J=>{console.log("📝 Input onChange event:",{fieldId:O,value:J.target.value});const k=J.target.value;b(O,k,M,C),F[O]&&T(C,k).isValid&&X(B=>{const K={...B};return delete K[O],K}),I[O]&&T(C,k).isValid&&R(B=>{const K={...B};return delete K[O],K})},onKeyDown:J=>{const k=J.ctrlKey||J.metaKey;if(J.key==="Enter"||J.key==="Tab"){const Q=T(C,J.currentTarget.value);R(B=>{const K={...B};return Q.isValid?delete K[O]:K[O]=Q.error,K}),X(B=>{const K={...B};return delete K[O],K});return}if(!k&&!No.includes(J.key)&&J.key.length===1){const Q=J.key;if(C.type==="phone"&&(/[0-9\s()\-]/.test(Q)||Q==="+"&&J.currentTarget.selectionStart===0&&!J.currentTarget.value.includes("+")||(J.preventDefault(),X(K=>({...K,[O]:"Telefon alanı yalnızca sayı ve (+) gibi sembolleri kabul eder"})))),C.type==="text"){const B=C.validation?.onlyLetters,K=C.validation?.noNumbers;B?/[a-zA-ZğüşıöçĞÜŞİÖÇ\s]/.test(Q)||(J.preventDefault(),X(Ye=>({...Ye,[O]:"Sadece harf girebilirsiniz"}))):K&&/\d/.test(Q)&&(J.preventDefault(),X(Ye=>({...Ye,[O]:"Sayı karakteri kullanamaz"})))}}},onBlur:J=>{const k=T(C,J.target.value);k.isValid?R(Q=>{const B={...Q};return delete B[O],B}):R(Q=>({...Q,[O]:k.error})),X(Q=>{const B={...Q};return delete B[O],B})}};function Le(J){const k=J.placeholder||J.label||"",Q=J.validation||{};if(J.type==="number"){const B=[];return Q.min!==void 0&&B.push(`min: ${Q.min}`),Q.max!==void 0&&B.push(`max: ${Q.max}`),Q.integer&&B.push("int"),B.length?`${k} (${B.join(", ")})`:k}if(J.type==="text"||J.type==="textarea"){const B=[];return Q.minLength&&B.push(`min ${Q.minLength}`),Q.maxLength&&B.push(`max ${Q.maxLength}`),B.length?`${k} (${B.join(", ")})`:k}return k}let ge;switch(C.type){case"text":case"email":case"phone":ge=E.createElement("input",{...we,type:C.type==="phone"?"tel":C.type,value:x||"",placeholder:Le(C),maxLength:C.validation?.maxLength,minLength:C.validation?.minLength,autoFocus:C.autoFocus||!1});break;case"textarea":ge=E.createElement("textarea",{...we,value:x||"",placeholder:Le(C),rows:3,maxLength:C.validation?.maxLength});break;case"number":ge=E.createElement("input",{...we,type:"text",inputMode:C.validation?.integer?"numeric":"decimal",value:x||"",placeholder:Le(C),"data-min":C.validation?.min,"data-max":C.validation?.max,"data-integer":C.validation?.integer||!1,onKeyDown:k=>{if(!(k.ctrlKey||k.metaKey)&&!No.includes(k.key)&&k.key.length===1){const B=/[0-9]/.test(k.key),K=k.key===".",de=k.key==="-",Ye=!C.validation?.integer,Dt=!C.validation?.positive&&k.currentTarget.selectionStart===0&&!k.currentTarget.value.includes("-");if(!B&&!(K&&Ye)&&!(de&&Dt)){k.preventDefault(),X(An=>({...An,[O]:"Sadece sayısal karakter girebilirsiniz"}));return}}if(k.key==="Enter"||k.key==="Tab"){const B=T(C,k.currentTarget.value);R(K=>{const de={...K};return B.isValid?delete de[O]:de[O]=B.error,de}),X(K=>{const de={...K};return delete de[O],de})}},onPaste:k=>{setTimeout(()=>{const Q=(k.clipboardData||window.clipboardData).getData("text"),B=v(Q);B!==Q&&b(O,B,M,C)},0)},title:(()=>{const k=[];return C.validation?.min!==void 0&&k.push(`Min: ${C.validation.min}`),C.validation?.max!==void 0&&k.push(`Max: ${C.validation.max}`),C.validation?.integer&&k.push("Tam sayı"),C.validation?.positive&&k.push("Pozitif sayı"),k.length>0?k.join(", "):""})()});break;case"date":ge=E.createElement("input",{...we,type:"date",value:x||""});break;case"dropdown":ge=E.createElement("select",{...we,value:x||""},E.createElement("option",{value:""},C.placeholder||`${C.label} seçin`),C.options?.map(k=>E.createElement("option",{key:k,value:k},k)));break;case"radio":ge=E.createElement("div",{className:"radio-group"},C.options?.map(k=>E.createElement("label",{key:k,className:"radio-option"},E.createElement("input",{type:"radio",name:O,value:k,checked:x===k,onChange:Q=>b(O,Q.target.value,M)}),E.createElement("span",null,k))));break;case"multiselect":case"checkbox":C.type==="checkbox"&&C.options?.length===1?ge=E.createElement("label",{className:"checkbox-single"},E.createElement("input",{type:"checkbox",checked:!!x,onChange:k=>b(O,k.target.checked,M)}),E.createElement("span",null,C.options[0])):ge=E.createElement("div",{className:"checkbox-group"},C.options?.map(k=>E.createElement("label",{key:k,className:"checkbox-option"},E.createElement("input",{type:"checkbox",value:k,checked:Array.isArray(x)?x.includes(k):!1,onChange:Q=>{const B=Array.isArray(x)?x:[],K=Q.target.checked?[...B,k]:B.filter(de=>de!==k);b(O,K,M)}}),E.createElement("span",null,k))));break;case"file":const J=M?p.customFields?.[O]:p[O];ge=E.createElement("div",{className:"file-upload-container"},E.createElement("div",{className:"file-upload-area",onDragOver:k=>{k.preventDefault(),k.currentTarget.classList.add("dragover")},onDragLeave:k=>{k.currentTarget.classList.remove("dragover")},onDrop:k=>{k.preventDefault(),k.currentTarget.classList.remove("dragover"),_(O,k.dataTransfer.files,M)},onClick:()=>document.getElementById(`file-input-${O}`).click()},E.createElement("input",{id:`file-input-${O}`,type:"file",multiple:!0,accept:ws.map(k=>`.${k}`).join(","),style:{display:"none"},onChange:k=>_(O,k.target.files,M)}),E.createElement("div",{className:"upload-text"},L?"Yükleniyor...":"Dosya seçin veya sürükleyip bırakın",E.createElement("div",{className:"upload-help"},`Desteklenen formatlar: ${ws.join(", ")}`))),J&&J.length>0&&E.createElement("div",{className:"file-preview"},J.map((k,Q)=>E.createElement("div",{key:Q,className:"file-item"},E.createElement("div",{className:"file-icon"},tu(k.type)?E.createElement("img",{src:k.dataUrl,alt:k.name,style:{width:"40px",height:"40px",objectFit:"cover"}}):E.createElement("span",null,ko(k.name).toUpperCase())),E.createElement("div",{className:"file-info"},E.createElement("div",{className:"file-name"},k.name),E.createElement("div",{className:"file-size"},`${(k.size/1024).toFixed(1)} KB`)),E.createElement("button",{type:"button",className:"btn-remove",onClick:()=>{const B=J.filter((K,de)=>de!==Q);b(O,B,M)}},"×")))));break;default:ge=E.createElement("input",{...we,type:"text",value:x||"",placeholder:C.placeholder||C.label})}return E.createElement("div",{key:O,className:`field ${$?"error":""}`},E.createElement("label",{htmlFor:O,className:"field-label"},C.label,C.required&&E.createElement("span",{className:"required"}," *"),$||ce?E.createElement("span",{className:`field-status ${$?"error":"warning"}`},$||ce):et?E.createElement("span",{className:"field-status success",title:"Geçerli"},"✓"):null),E.createElement("div",{className:"input-container",style:{position:"relative"}},ge,null,null),null)}if(s)return E.createElement("div",{className:"loading"},"Form yükleniyor...");if(!h)return E.createElement("div",{className:"error"},"Form konfigürasyonu bulunamadı");const Qe=Tr.map((C,M)=>({...C,display:{formOrder:M+1},autoFocus:M===0})),Ze=(h?.fields||h?.formStructure?.fields||[]).map((C,M)=>({...C,display:{...C.display,formOrder:C.display?.formOrder??10+M}})),dt=[...Qe].sort((C,M)=>(C.display?.formOrder||0)-(M.display?.formOrder||0)),In=[...Ze].sort((C,M)=>(C.display?.formOrder||0)-(M.display?.formOrder||0));function Gt(){const C=[...dt,...In],M=[];return C.forEach(O=>{const $=!Tr.some(ae=>ae.id===O.id)?p.customFields?.[O.id]:p[O.id],ce=Array.isArray($)?$.length===0:$==null||String($).trim()==="";!O.required&&ce&&M.push({id:O.id,label:O.label})}),M}async function Ht(C){await n(C),t("Teklif başarıyla gönderildi!","success"),m({customFields:{}}),R({})}return ve=async function(C){if(C.preventDefault(),!y()){t("Lütfen form hatalarını düzeltin","error");return}try{c(!0);const O={id:Vo(),createdAt:new Date().toISOString(),status:"new",name:p.name,company:p.company,proj:p.proj,phone:p.phone,email:p.email,customFields:p.customFields||{},formVersion:h?.version,formConfigSnapshot:h,lang:localStorage.getItem("bk_lang")||"tr"},x=Gt();if(x.length>0){w(x),Se(O),ie(!0),c(!1);return}await Ht(O)}catch(O){console.error("Submit error:",O),t("Form gönderilemedi. Lütfen tekrar deneyin.","error")}finally{c(!1)}},E.createElement("div",{className:"container"},E.createElement("form",{onSubmit:ve,className:"dynamic-form two-col"},E.createElement("div",{className:"form-section fixed-fields"},E.createElement("div",{className:"section-card"},(()=>{const C=localStorage.getItem("bk_lang")||"tr",M=C==="en"?"Customer Information":"Müşteri Bilgileri",O=C==="en"?"Fields marked * are required":"* işaretli alanlar zorunludur";return E.createElement(E.Fragment,null,E.createElement("div",{className:"section-title"},M),E.createElement("div",{className:"required-note"},O))})(),E.createElement("div",{className:"form-grid"},dt.map(C=>Ke(C,!1))))),E.createElement("div",{className:"form-section custom-fields"},E.createElement("div",{className:"section-card"},(()=>{const M=(localStorage.getItem("bk_lang")||"tr")==="en"?"Additional Fields":"Form Alanları";return E.createElement("div",{className:"section-title"},M)})(),E.createElement("div",{className:"form-grid"},In.map(C=>Ke(C,!0))))),E.createElement("div",{className:"form-actions"},E.createElement("button",{type:"submit",className:"btn accent",disabled:a},a?"Gönderiliyor...":"Teklif Gönder")),oe&&E.createElement("div",{className:"modal-overlay","data-backdrop":"true",onClick:()=>ie(!1)},E.createElement("div",{className:"modal",onClick:C=>C.stopPropagation()},E.createElement("div",{className:"modal-header"},(()=>{const M=(localStorage.getItem("bk_lang")||"tr")==="en"?"There are fields left empty":"Boş bırakılan alanlar var";return E.createElement("h3",null,M)})()),E.createElement("div",{className:"modal-body"},(()=>{const M=(localStorage.getItem("bk_lang")||"tr")==="en"?"Would you like to review the empty fields before submitting?":"Boş bırakılan alanları tekrar gözden geçirmek ister misiniz?";return E.createElement("p",null,M)})(),E.createElement("div",{style:{maxHeight:200,overflow:"auto",marginTop:8}},E.createElement("ul",null,me.map(C=>E.createElement("li",{key:C.id},C.label))))),E.createElement("div",{className:"modal-footer"},E.createElement("button",{type:"button",className:"btn secondary",onClick:()=>ie(!1)},(localStorage.getItem("bk_lang")||"tr")==="en"?"Review fields":"Alanları gözden geçir"),E.createElement("button",{type:"button",className:"btn primary",onClick:async()=>{const C=xe;ie(!1),Se(null),await Ht(C)}},(localStorage.getItem("bk_lang")||"tr")==="en"?"Continue and submit":"Devam et ve gönder"))))))}const ru=()=>{};var Fo={};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ya=function(n){const e=[];let t=0;for(let r=0;r<n.length;r++){let s=n.charCodeAt(r);s<128?e[t++]=s:s<2048?(e[t++]=s>>6|192,e[t++]=s&63|128):(s&64512)===55296&&r+1<n.length&&(n.charCodeAt(r+1)&64512)===56320?(s=65536+((s&1023)<<10)+(n.charCodeAt(++r)&1023),e[t++]=s>>18|240,e[t++]=s>>12&63|128,e[t++]=s>>6&63|128,e[t++]=s&63|128):(e[t++]=s>>12|224,e[t++]=s>>6&63|128,e[t++]=s&63|128)}return e},su=function(n){const e=[];let t=0,r=0;for(;t<n.length;){const s=n[t++];if(s<128)e[r++]=String.fromCharCode(s);else if(s>191&&s<224){const o=n[t++];e[r++]=String.fromCharCode((s&31)<<6|o&63)}else if(s>239&&s<365){const o=n[t++],a=n[t++],c=n[t++],h=((s&7)<<18|(o&63)<<12|(a&63)<<6|c&63)-65536;e[r++]=String.fromCharCode(55296+(h>>10)),e[r++]=String.fromCharCode(56320+(h&1023))}else{const o=n[t++],a=n[t++];e[r++]=String.fromCharCode((s&15)<<12|(o&63)<<6|a&63)}}return e.join("")},Xa={byteToCharMap_:null,charToByteMap_:null,byteToCharMapWebSafe_:null,charToByteMapWebSafe_:null,ENCODED_VALS_BASE:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",get ENCODED_VALS(){return this.ENCODED_VALS_BASE+"+/="},get ENCODED_VALS_WEBSAFE(){return this.ENCODED_VALS_BASE+"-_."},HAS_NATIVE_SUPPORT:typeof atob=="function",encodeByteArray(n,e){if(!Array.isArray(n))throw Error("encodeByteArray takes an array as a parameter");this.init_();const t=e?this.byteToCharMapWebSafe_:this.byteToCharMap_,r=[];for(let s=0;s<n.length;s+=3){const o=n[s],a=s+1<n.length,c=a?n[s+1]:0,h=s+2<n.length,d=h?n[s+2]:0,p=o>>2,m=(o&3)<<4|c>>4;let I=(c&15)<<2|d>>6,R=d&63;h||(R=64,a||(I=64)),r.push(t[p],t[m],t[I],t[R])}return r.join("")},encodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?btoa(n):this.encodeByteArray(Ya(n),e)},decodeString(n,e){return this.HAS_NATIVE_SUPPORT&&!e?atob(n):su(this.decodeStringToByteArray(n,e))},decodeStringToByteArray(n,e){this.init_();const t=e?this.charToByteMapWebSafe_:this.charToByteMap_,r=[];for(let s=0;s<n.length;){const o=t[n.charAt(s++)],c=s<n.length?t[n.charAt(s)]:0;++s;const d=s<n.length?t[n.charAt(s)]:64;++s;const m=s<n.length?t[n.charAt(s)]:64;if(++s,o==null||c==null||d==null||m==null)throw new iu;const I=o<<2|c>>4;if(r.push(I),d!==64){const R=c<<4&240|d>>2;if(r.push(R),m!==64){const L=d<<6&192|m;r.push(L)}}}return r},init_(){if(!this.byteToCharMap_){this.byteToCharMap_={},this.charToByteMap_={},this.byteToCharMapWebSafe_={},this.charToByteMapWebSafe_={};for(let n=0;n<this.ENCODED_VALS.length;n++)this.byteToCharMap_[n]=this.ENCODED_VALS.charAt(n),this.charToByteMap_[this.byteToCharMap_[n]]=n,this.byteToCharMapWebSafe_[n]=this.ENCODED_VALS_WEBSAFE.charAt(n),this.charToByteMapWebSafe_[this.byteToCharMapWebSafe_[n]]=n,n>=this.ENCODED_VALS_BASE.length&&(this.charToByteMap_[this.ENCODED_VALS_WEBSAFE.charAt(n)]=n,this.charToByteMapWebSafe_[this.ENCODED_VALS.charAt(n)]=n)}}};class iu extends Error{constructor(){super(...arguments),this.name="DecodeBase64StringError"}}const ou=function(n){const e=Ya(n);return Xa.encodeByteArray(e,!0)},Nr=function(n){return ou(n).replace(/\./g,"")},au=function(n){try{return Xa.decodeString(n,!0)}catch(e){console.error("base64Decode failed: ",e)}return null};/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function lu(){if(typeof self<"u")return self;if(typeof window<"u")return window;if(typeof global<"u")return global;throw new Error("Unable to locate global object.")}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const cu=()=>lu().__FIREBASE_DEFAULTS__,uu=()=>{if(typeof process>"u"||typeof Fo>"u")return;const n=Fo.__FIREBASE_DEFAULTS__;if(n)return JSON.parse(n)},hu=()=>{if(typeof document>"u")return;let n;try{n=document.cookie.match(/__FIREBASE_DEFAULTS__=([^;]+)/)}catch{return}const e=n&&au(n[1]);return e&&JSON.parse(e)},li=()=>{try{return ru()||cu()||uu()||hu()}catch(n){console.info(`Unable to get __FIREBASE_DEFAULTS__ due to: ${n}`);return}},du=n=>li()?.emulatorHosts?.[n],fu=n=>{const e=du(n);if(!e)return;const t=e.lastIndexOf(":");if(t<=0||t+1===e.length)throw new Error(`Invalid host ${e} with no separate hostname and port!`);const r=parseInt(e.substring(t+1),10);return e[0]==="["?[e.substring(1,t-1),r]:[e.substring(0,t),r]},Ja=()=>li()?.config;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class pu{constructor(){this.reject=()=>{},this.resolve=()=>{},this.promise=new Promise((e,t)=>{this.resolve=e,this.reject=t})}wrapCallback(e){return(t,r)=>{t?this.reject(t):this.resolve(r),typeof e=="function"&&(this.promise.catch(()=>{}),e.length===1?e(t):e(t,r))}}}/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ci(n){try{return(n.startsWith("http://")||n.startsWith("https://")?new URL(n).hostname:n).endsWith(".cloudworkstations.dev")}catch{return!1}}async function mu(n){return(await fetch(n,{credentials:"include"})).ok}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function gu(n,e){if(n.uid)throw new Error('The "uid" field is no longer supported by mockUserToken. Please use "sub" instead for Firebase Auth User ID.');const t={alg:"none",type:"JWT"},r=e||"demo-project",s=n.iat||0,o=n.sub||n.user_id;if(!o)throw new Error("mockUserToken must contain 'sub' or 'user_id' field!");const a={iss:`https://securetoken.google.com/${r}`,aud:r,iat:s,exp:s+3600,auth_time:s,sub:o,user_id:o,firebase:{sign_in_provider:"custom",identities:{}},...n};return[Nr(JSON.stringify(t)),Nr(JSON.stringify(a)),""].join(".")}const Hn={};function yu(){const n={prod:[],emulator:[]};for(const e of Object.keys(Hn))Hn[e]?n.emulator.push(e):n.prod.push(e);return n}function _u(n){let e=document.getElementById(n),t=!1;return e||(e=document.createElement("div"),e.setAttribute("id",n),t=!0),{created:t,element:e}}let Mo=!1;function Eu(n,e){if(typeof window>"u"||typeof document>"u"||!ci(window.location.host)||Hn[n]===e||Hn[n]||Mo)return;Hn[n]=e;function t(I){return`__firebase__banner__${I}`}const r="__firebase__banner",o=yu().prod.length>0;function a(){const I=document.getElementById(r);I&&I.remove()}function c(I){I.style.display="flex",I.style.background="#7faaf0",I.style.position="fixed",I.style.bottom="5px",I.style.left="5px",I.style.padding=".5em",I.style.borderRadius="5px",I.style.alignItems="center"}function h(I,R){I.setAttribute("width","24"),I.setAttribute("id",R),I.setAttribute("height","24"),I.setAttribute("viewBox","0 0 24 24"),I.setAttribute("fill","none"),I.style.marginLeft="-6px"}function d(){const I=document.createElement("span");return I.style.cursor="pointer",I.style.marginLeft="16px",I.style.fontSize="24px",I.innerHTML=" &times;",I.onclick=()=>{Mo=!0,a()},I}function p(I,R){I.setAttribute("id",R),I.innerText="Learn more",I.href="https://firebase.google.com/docs/studio/preview-apps#preview-backend",I.setAttribute("target","__blank"),I.style.paddingLeft="5px",I.style.textDecoration="underline"}function m(){const I=_u(r),R=t("text"),L=document.getElementById(R)||document.createElement("span"),z=t("learnmore"),F=document.getElementById(z)||document.createElement("a"),X=t("preprendIcon"),oe=document.getElementById(X)||document.createElementNS("http://www.w3.org/2000/svg","svg");if(I.created){const ie=I.element;c(ie),p(F,z);const xe=d();h(oe,X),ie.append(oe,L,F,xe),document.body.appendChild(ie)}o?(L.innerText="Preview backend disconnected.",oe.innerHTML=`<g clip-path="url(#clip0_6013_33858)">
<path d="M4.8 17.6L12 5.6L19.2 17.6H4.8ZM6.91667 16.4H17.0833L12 7.93333L6.91667 16.4ZM12 15.6C12.1667 15.6 12.3056 15.5444 12.4167 15.4333C12.5389 15.3111 12.6 15.1667 12.6 15C12.6 14.8333 12.5389 14.6944 12.4167 14.5833C12.3056 14.4611 12.1667 14.4 12 14.4C11.8333 14.4 11.6889 14.4611 11.5667 14.5833C11.4556 14.6944 11.4 14.8333 11.4 15C11.4 15.1667 11.4556 15.3111 11.5667 15.4333C11.6889 15.5444 11.8333 15.6 12 15.6ZM11.4 13.6H12.6V10.4H11.4V13.6Z" fill="#212121"/>
</g>
<defs>
<clipPath id="clip0_6013_33858">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>`):(oe.innerHTML=`<g clip-path="url(#clip0_6083_34804)">
<path d="M11.4 15.2H12.6V11.2H11.4V15.2ZM12 10C12.1667 10 12.3056 9.94444 12.4167 9.83333C12.5389 9.71111 12.6 9.56667 12.6 9.4C12.6 9.23333 12.5389 9.09444 12.4167 8.98333C12.3056 8.86111 12.1667 8.8 12 8.8C11.8333 8.8 11.6889 8.86111 11.5667 8.98333C11.4556 9.09444 11.4 9.23333 11.4 9.4C11.4 9.56667 11.4556 9.71111 11.5667 9.83333C11.6889 9.94444 11.8333 10 12 10ZM12 18.4C11.1222 18.4 10.2944 18.2333 9.51667 17.9C8.73889 17.5667 8.05556 17.1111 7.46667 16.5333C6.88889 15.9444 6.43333 15.2611 6.1 14.4833C5.76667 13.7056 5.6 12.8778 5.6 12C5.6 11.1111 5.76667 10.2833 6.1 9.51667C6.43333 8.73889 6.88889 8.06111 7.46667 7.48333C8.05556 6.89444 8.73889 6.43333 9.51667 6.1C10.2944 5.76667 11.1222 5.6 12 5.6C12.8889 5.6 13.7167 5.76667 14.4833 6.1C15.2611 6.43333 15.9389 6.89444 16.5167 7.48333C17.1056 8.06111 17.5667 8.73889 17.9 9.51667C18.2333 10.2833 18.4 11.1111 18.4 12C18.4 12.8778 18.2333 13.7056 17.9 14.4833C17.5667 15.2611 17.1056 15.9444 16.5167 16.5333C15.9389 17.1111 15.2611 17.5667 14.4833 17.9C13.7167 18.2333 12.8889 18.4 12 18.4ZM12 17.2C13.4444 17.2 14.6722 16.6944 15.6833 15.6833C16.6944 14.6722 17.2 13.4444 17.2 12C17.2 10.5556 16.6944 9.32778 15.6833 8.31667C14.6722 7.30555 13.4444 6.8 12 6.8C10.5556 6.8 9.32778 7.30555 8.31667 8.31667C7.30556 9.32778 6.8 10.5556 6.8 12C6.8 13.4444 7.30556 14.6722 8.31667 15.6833C9.32778 16.6944 10.5556 17.2 12 17.2Z" fill="#212121"/>
</g>
<defs>
<clipPath id="clip0_6083_34804">
<rect width="24" height="24" fill="white"/>
</clipPath>
</defs>`,L.innerText="Preview backend running in this workspace."),L.setAttribute("id",R)}document.readyState==="loading"?window.addEventListener("DOMContentLoaded",m):m()}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function vu(){return typeof navigator<"u"&&typeof navigator.userAgent=="string"?navigator.userAgent:""}function Tu(){const n=li()?.forceEnvironment;if(n==="node")return!0;if(n==="browser")return!1;try{return Object.prototype.toString.call(global.process)==="[object process]"}catch{return!1}}function wu(){return!Tu()&&!!navigator.userAgent&&navigator.userAgent.includes("Safari")&&!navigator.userAgent.includes("Chrome")}function Iu(){try{return typeof indexedDB=="object"}catch{return!1}}function bu(){return new Promise((n,e)=>{try{let t=!0;const r="validate-browser-context-for-indexeddb-analytics-module",s=self.indexedDB.open(r);s.onsuccess=()=>{s.result.close(),t||self.indexedDB.deleteDatabase(r),n(!0)},s.onupgradeneeded=()=>{t=!1},s.onerror=()=>{e(s.error?.message||"")}}catch(t){e(t)}})}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Au="FirebaseError";class yn extends Error{constructor(e,t,r){super(t),this.code=e,this.customData=r,this.name=Au,Object.setPrototypeOf(this,yn.prototype),Error.captureStackTrace&&Error.captureStackTrace(this,Za.prototype.create)}}class Za{constructor(e,t,r){this.service=e,this.serviceName=t,this.errors=r}create(e,...t){const r=t[0]||{},s=`${this.service}/${e}`,o=this.errors[e],a=o?Su(o,r):"Error",c=`${this.serviceName}: ${a} (${s}).`;return new yn(s,c,r)}}function Su(n,e){return n.replace(Ru,(t,r)=>{const s=e[r];return s!=null?String(s):`<${r}?>`})}const Ru=/\{\$([^}]+)}/g;function Fr(n,e){if(n===e)return!0;const t=Object.keys(n),r=Object.keys(e);for(const s of t){if(!r.includes(s))return!1;const o=n[s],a=e[s];if(Oo(o)&&Oo(a)){if(!Fr(o,a))return!1}else if(o!==a)return!1}for(const s of r)if(!t.includes(s))return!1;return!0}function Oo(n){return n!==null&&typeof n=="object"}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Xn(n){return n&&n._delegate?n._delegate:n}class Jn{constructor(e,t,r){this.name=e,this.instanceFactory=t,this.type=r,this.multipleInstances=!1,this.serviceProps={},this.instantiationMode="LAZY",this.onInstanceCreated=null}setInstantiationMode(e){return this.instantiationMode=e,this}setMultipleInstances(e){return this.multipleInstances=e,this}setServiceProps(e){return this.serviceProps=e,this}setInstanceCreatedCallback(e){return this.onInstanceCreated=e,this}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Lt="[DEFAULT]";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Cu{constructor(e,t){this.name=e,this.container=t,this.component=null,this.instances=new Map,this.instancesDeferred=new Map,this.instancesOptions=new Map,this.onInitCallbacks=new Map}get(e){const t=this.normalizeInstanceIdentifier(e);if(!this.instancesDeferred.has(t)){const r=new pu;if(this.instancesDeferred.set(t,r),this.isInitialized(t)||this.shouldAutoInitialize())try{const s=this.getOrInitializeService({instanceIdentifier:t});s&&r.resolve(s)}catch{}}return this.instancesDeferred.get(t).promise}getImmediate(e){const t=this.normalizeInstanceIdentifier(e?.identifier),r=e?.optional??!1;if(this.isInitialized(t)||this.shouldAutoInitialize())try{return this.getOrInitializeService({instanceIdentifier:t})}catch(s){if(r)return null;throw s}else{if(r)return null;throw Error(`Service ${this.name} is not available`)}}getComponent(){return this.component}setComponent(e){if(e.name!==this.name)throw Error(`Mismatching Component ${e.name} for Provider ${this.name}.`);if(this.component)throw Error(`Component for ${this.name} has already been provided`);if(this.component=e,!!this.shouldAutoInitialize()){if(xu(e))try{this.getOrInitializeService({instanceIdentifier:Lt})}catch{}for(const[t,r]of this.instancesDeferred.entries()){const s=this.normalizeInstanceIdentifier(t);try{const o=this.getOrInitializeService({instanceIdentifier:s});r.resolve(o)}catch{}}}}clearInstance(e=Lt){this.instancesDeferred.delete(e),this.instancesOptions.delete(e),this.instances.delete(e)}async delete(){const e=Array.from(this.instances.values());await Promise.all([...e.filter(t=>"INTERNAL"in t).map(t=>t.INTERNAL.delete()),...e.filter(t=>"_delete"in t).map(t=>t._delete())])}isComponentSet(){return this.component!=null}isInitialized(e=Lt){return this.instances.has(e)}getOptions(e=Lt){return this.instancesOptions.get(e)||{}}initialize(e={}){const{options:t={}}=e,r=this.normalizeInstanceIdentifier(e.instanceIdentifier);if(this.isInitialized(r))throw Error(`${this.name}(${r}) has already been initialized`);if(!this.isComponentSet())throw Error(`Component ${this.name} has not been registered yet`);const s=this.getOrInitializeService({instanceIdentifier:r,options:t});for(const[o,a]of this.instancesDeferred.entries()){const c=this.normalizeInstanceIdentifier(o);r===c&&a.resolve(s)}return s}onInit(e,t){const r=this.normalizeInstanceIdentifier(t),s=this.onInitCallbacks.get(r)??new Set;s.add(e),this.onInitCallbacks.set(r,s);const o=this.instances.get(r);return o&&e(o,r),()=>{s.delete(e)}}invokeOnInitCallbacks(e,t){const r=this.onInitCallbacks.get(t);if(r)for(const s of r)try{s(e,t)}catch{}}getOrInitializeService({instanceIdentifier:e,options:t={}}){let r=this.instances.get(e);if(!r&&this.component&&(r=this.component.instanceFactory(this.container,{instanceIdentifier:Pu(e),options:t}),this.instances.set(e,r),this.instancesOptions.set(e,t),this.invokeOnInitCallbacks(r,e),this.component.onInstanceCreated))try{this.component.onInstanceCreated(this.container,e,r)}catch{}return r||null}normalizeInstanceIdentifier(e=Lt){return this.component?this.component.multipleInstances?e:Lt:e}shouldAutoInitialize(){return!!this.component&&this.component.instantiationMode!=="EXPLICIT"}}function Pu(n){return n===Lt?void 0:n}function xu(n){return n.instantiationMode==="EAGER"}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Vu{constructor(e){this.name=e,this.providers=new Map}addComponent(e){const t=this.getProvider(e.name);if(t.isComponentSet())throw new Error(`Component ${e.name} has already been registered with ${this.name}`);t.setComponent(e)}addOrOverwriteComponent(e){this.getProvider(e.name).isComponentSet()&&this.providers.delete(e.name),this.addComponent(e)}getProvider(e){if(this.providers.has(e))return this.providers.get(e);const t=new Cu(e,this);return this.providers.set(e,t),t}getProviders(){return Array.from(this.providers.values())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var te;(function(n){n[n.DEBUG=0]="DEBUG",n[n.VERBOSE=1]="VERBOSE",n[n.INFO=2]="INFO",n[n.WARN=3]="WARN",n[n.ERROR=4]="ERROR",n[n.SILENT=5]="SILENT"})(te||(te={}));const Du={debug:te.DEBUG,verbose:te.VERBOSE,info:te.INFO,warn:te.WARN,error:te.ERROR,silent:te.SILENT},ku=te.INFO,Nu={[te.DEBUG]:"log",[te.VERBOSE]:"log",[te.INFO]:"info",[te.WARN]:"warn",[te.ERROR]:"error"},Fu=(n,e,...t)=>{if(e<n.logLevel)return;const r=new Date().toISOString(),s=Nu[e];if(s)console[s](`[${r}]  ${n.name}:`,...t);else throw new Error(`Attempted to log a message with an invalid logType (value: ${e})`)};class el{constructor(e){this.name=e,this._logLevel=ku,this._logHandler=Fu,this._userLogHandler=null}get logLevel(){return this._logLevel}set logLevel(e){if(!(e in te))throw new TypeError(`Invalid value "${e}" assigned to \`logLevel\``);this._logLevel=e}setLogLevel(e){this._logLevel=typeof e=="string"?Du[e]:e}get logHandler(){return this._logHandler}set logHandler(e){if(typeof e!="function")throw new TypeError("Value assigned to `logHandler` must be a function");this._logHandler=e}get userLogHandler(){return this._userLogHandler}set userLogHandler(e){this._userLogHandler=e}debug(...e){this._userLogHandler&&this._userLogHandler(this,te.DEBUG,...e),this._logHandler(this,te.DEBUG,...e)}log(...e){this._userLogHandler&&this._userLogHandler(this,te.VERBOSE,...e),this._logHandler(this,te.VERBOSE,...e)}info(...e){this._userLogHandler&&this._userLogHandler(this,te.INFO,...e),this._logHandler(this,te.INFO,...e)}warn(...e){this._userLogHandler&&this._userLogHandler(this,te.WARN,...e),this._logHandler(this,te.WARN,...e)}error(...e){this._userLogHandler&&this._userLogHandler(this,te.ERROR,...e),this._logHandler(this,te.ERROR,...e)}}const Mu=(n,e)=>e.some(t=>n instanceof t);let Lo,Uo;function Ou(){return Lo||(Lo=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function Lu(){return Uo||(Uo=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const tl=new WeakMap,Fs=new WeakMap,nl=new WeakMap,Is=new WeakMap,ui=new WeakMap;function Uu(n){const e=new Promise((t,r)=>{const s=()=>{n.removeEventListener("success",o),n.removeEventListener("error",a)},o=()=>{t(wt(n.result)),s()},a=()=>{r(n.error),s()};n.addEventListener("success",o),n.addEventListener("error",a)});return e.then(t=>{t instanceof IDBCursor&&tl.set(t,n)}).catch(()=>{}),ui.set(e,n),e}function Bu(n){if(Fs.has(n))return;const e=new Promise((t,r)=>{const s=()=>{n.removeEventListener("complete",o),n.removeEventListener("error",a),n.removeEventListener("abort",a)},o=()=>{t(),s()},a=()=>{r(n.error||new DOMException("AbortError","AbortError")),s()};n.addEventListener("complete",o),n.addEventListener("error",a),n.addEventListener("abort",a)});Fs.set(n,e)}let Ms={get(n,e,t){if(n instanceof IDBTransaction){if(e==="done")return Fs.get(n);if(e==="objectStoreNames")return n.objectStoreNames||nl.get(n);if(e==="store")return t.objectStoreNames[1]?void 0:t.objectStore(t.objectStoreNames[0])}return wt(n[e])},set(n,e,t){return n[e]=t,!0},has(n,e){return n instanceof IDBTransaction&&(e==="done"||e==="store")?!0:e in n}};function ju(n){Ms=n(Ms)}function zu(n){return n===IDBDatabase.prototype.transaction&&!("objectStoreNames"in IDBTransaction.prototype)?function(e,...t){const r=n.call(bs(this),e,...t);return nl.set(r,e.sort?e.sort():[e]),wt(r)}:Lu().includes(n)?function(...e){return n.apply(bs(this),e),wt(tl.get(this))}:function(...e){return wt(n.apply(bs(this),e))}}function $u(n){return typeof n=="function"?zu(n):(n instanceof IDBTransaction&&Bu(n),Mu(n,Ou())?new Proxy(n,Ms):n)}function wt(n){if(n instanceof IDBRequest)return Uu(n);if(Is.has(n))return Is.get(n);const e=$u(n);return e!==n&&(Is.set(n,e),ui.set(e,n)),e}const bs=n=>ui.get(n);function qu(n,e,{blocked:t,upgrade:r,blocking:s,terminated:o}={}){const a=indexedDB.open(n,e),c=wt(a);return r&&a.addEventListener("upgradeneeded",h=>{r(wt(a.result),h.oldVersion,h.newVersion,wt(a.transaction),h)}),t&&a.addEventListener("blocked",h=>t(h.oldVersion,h.newVersion,h)),c.then(h=>{o&&h.addEventListener("close",()=>o()),s&&h.addEventListener("versionchange",d=>s(d.oldVersion,d.newVersion,d))}).catch(()=>{}),c}const Gu=["get","getKey","getAll","getAllKeys","count"],Hu=["put","add","delete","clear"],As=new Map;function Bo(n,e){if(!(n instanceof IDBDatabase&&!(e in n)&&typeof e=="string"))return;if(As.get(e))return As.get(e);const t=e.replace(/FromIndex$/,""),r=e!==t,s=Hu.includes(t);if(!(t in(r?IDBIndex:IDBObjectStore).prototype)||!(s||Gu.includes(t)))return;const o=async function(a,...c){const h=this.transaction(a,s?"readwrite":"readonly");let d=h.store;return r&&(d=d.index(c.shift())),(await Promise.all([d[t](...c),s&&h.done]))[0]};return As.set(e,o),o}ju(n=>({...n,get:(e,t,r)=>Bo(e,t)||n.get(e,t,r),has:(e,t)=>!!Bo(e,t)||n.has(e,t)}));/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ku{constructor(e){this.container=e}getPlatformInfoString(){return this.container.getProviders().map(t=>{if(Wu(t)){const r=t.getImmediate();return`${r.library}/${r.version}`}else return null}).filter(t=>t).join(" ")}}function Wu(n){return n.getComponent()?.type==="VERSION"}const Os="@firebase/app",jo="0.14.3";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ut=new el("@firebase/app"),Qu="@firebase/app-compat",Yu="@firebase/analytics-compat",Xu="@firebase/analytics",Ju="@firebase/app-check-compat",Zu="@firebase/app-check",eh="@firebase/auth",th="@firebase/auth-compat",nh="@firebase/database",rh="@firebase/data-connect",sh="@firebase/database-compat",ih="@firebase/functions",oh="@firebase/functions-compat",ah="@firebase/installations",lh="@firebase/installations-compat",ch="@firebase/messaging",uh="@firebase/messaging-compat",hh="@firebase/performance",dh="@firebase/performance-compat",fh="@firebase/remote-config",ph="@firebase/remote-config-compat",mh="@firebase/storage",gh="@firebase/storage-compat",yh="@firebase/firestore",_h="@firebase/ai",Eh="@firebase/firestore-compat",vh="firebase",Th="12.3.0";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ls="[DEFAULT]",wh={[Os]:"fire-core",[Qu]:"fire-core-compat",[Xu]:"fire-analytics",[Yu]:"fire-analytics-compat",[Zu]:"fire-app-check",[Ju]:"fire-app-check-compat",[eh]:"fire-auth",[th]:"fire-auth-compat",[nh]:"fire-rtdb",[rh]:"fire-data-connect",[sh]:"fire-rtdb-compat",[ih]:"fire-fn",[oh]:"fire-fn-compat",[ah]:"fire-iid",[lh]:"fire-iid-compat",[ch]:"fire-fcm",[uh]:"fire-fcm-compat",[hh]:"fire-perf",[dh]:"fire-perf-compat",[fh]:"fire-rc",[ph]:"fire-rc-compat",[mh]:"fire-gcs",[gh]:"fire-gcs-compat",[yh]:"fire-fst",[Eh]:"fire-fst-compat",[_h]:"fire-vertex","fire-js":"fire-js",[vh]:"fire-js-all"};/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Mr=new Map,Ih=new Map,Us=new Map;function zo(n,e){try{n.container.addComponent(e)}catch(t){ut.debug(`Component ${e.name} failed to register with FirebaseApp ${n.name}`,t)}}function Or(n){const e=n.name;if(Us.has(e))return ut.debug(`There were multiple attempts to register component ${e}.`),!1;Us.set(e,n);for(const t of Mr.values())zo(t,n);for(const t of Ih.values())zo(t,n);return!0}function bh(n,e){const t=n.container.getProvider("heartbeat").getImmediate({optional:!0});return t&&t.triggerHeartbeat(),n.container.getProvider(e)}function Ah(n){return n==null?!1:n.settings!==void 0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Sh={"no-app":"No Firebase App '{$appName}' has been created - call initializeApp() first","bad-app-name":"Illegal App name: '{$appName}'","duplicate-app":"Firebase App named '{$appName}' already exists with different options or config","app-deleted":"Firebase App named '{$appName}' already deleted","server-app-deleted":"Firebase Server App has been deleted","no-options":"Need to provide options, when not being deployed to hosting via source.","invalid-app-argument":"firebase.{$appName}() takes either no argument or a Firebase App instance.","invalid-log-argument":"First argument to `onLog` must be null or a function.","idb-open":"Error thrown when opening IndexedDB. Original error: {$originalErrorMessage}.","idb-get":"Error thrown when reading from IndexedDB. Original error: {$originalErrorMessage}.","idb-set":"Error thrown when writing to IndexedDB. Original error: {$originalErrorMessage}.","idb-delete":"Error thrown when deleting from IndexedDB. Original error: {$originalErrorMessage}.","finalization-registry-not-supported":"FirebaseServerApp deleteOnDeref field defined but the JS runtime does not support FinalizationRegistry.","invalid-server-app-environment":"FirebaseServerApp is not for use in browser environments."},It=new Za("app","Firebase",Sh);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Rh{constructor(e,t,r){this._isDeleted=!1,this._options={...e},this._config={...t},this._name=t.name,this._automaticDataCollectionEnabled=t.automaticDataCollectionEnabled,this._container=r,this.container.addComponent(new Jn("app",()=>this,"PUBLIC"))}get automaticDataCollectionEnabled(){return this.checkDestroyed(),this._automaticDataCollectionEnabled}set automaticDataCollectionEnabled(e){this.checkDestroyed(),this._automaticDataCollectionEnabled=e}get name(){return this.checkDestroyed(),this._name}get options(){return this.checkDestroyed(),this._options}get config(){return this.checkDestroyed(),this._config}get container(){return this._container}get isDeleted(){return this._isDeleted}set isDeleted(e){this._isDeleted=e}checkDestroyed(){if(this.isDeleted)throw It.create("app-deleted",{appName:this._name})}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ch=Th;function rl(n,e={}){let t=n;typeof e!="object"&&(e={name:e});const r={name:Ls,automaticDataCollectionEnabled:!0,...e},s=r.name;if(typeof s!="string"||!s)throw It.create("bad-app-name",{appName:String(s)});if(t||(t=Ja()),!t)throw It.create("no-options");const o=Mr.get(s);if(o){if(Fr(t,o.options)&&Fr(r,o.config))return o;throw It.create("duplicate-app",{appName:s})}const a=new Vu(s);for(const h of Us.values())a.addComponent(h);const c=new Rh(t,r,a);return Mr.set(s,c),c}function Ph(n=Ls){const e=Mr.get(n);if(!e&&n===Ls&&Ja())return rl();if(!e)throw It.create("no-app",{appName:n});return e}function rn(n,e,t){let r=wh[n]??n;t&&(r+=`-${t}`);const s=r.match(/\s|\//),o=e.match(/\s|\//);if(s||o){const a=[`Unable to register library "${r}" with version "${e}":`];s&&a.push(`library name "${r}" contains illegal characters (whitespace or "/")`),s&&o&&a.push("and"),o&&a.push(`version name "${e}" contains illegal characters (whitespace or "/")`),ut.warn(a.join(" "));return}Or(new Jn(`${r}-version`,()=>({library:r,version:e}),"VERSION"))}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const xh="firebase-heartbeat-database",Vh=1,Zn="firebase-heartbeat-store";let Ss=null;function sl(){return Ss||(Ss=qu(xh,Vh,{upgrade:(n,e)=>{switch(e){case 0:try{n.createObjectStore(Zn)}catch(t){console.warn(t)}}}}).catch(n=>{throw It.create("idb-open",{originalErrorMessage:n.message})})),Ss}async function Dh(n){try{const t=(await sl()).transaction(Zn),r=await t.objectStore(Zn).get(il(n));return await t.done,r}catch(e){if(e instanceof yn)ut.warn(e.message);else{const t=It.create("idb-get",{originalErrorMessage:e?.message});ut.warn(t.message)}}}async function $o(n,e){try{const r=(await sl()).transaction(Zn,"readwrite");await r.objectStore(Zn).put(e,il(n)),await r.done}catch(t){if(t instanceof yn)ut.warn(t.message);else{const r=It.create("idb-set",{originalErrorMessage:t?.message});ut.warn(r.message)}}}function il(n){return`${n.name}!${n.options.appId}`}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const kh=1024,Nh=30;class Fh{constructor(e){this.container=e,this._heartbeatsCache=null;const t=this.container.getProvider("app").getImmediate();this._storage=new Oh(t),this._heartbeatsCachePromise=this._storage.read().then(r=>(this._heartbeatsCache=r,r))}async triggerHeartbeat(){try{const t=this.container.getProvider("platform-logger").getImmediate().getPlatformInfoString(),r=qo();if(this._heartbeatsCache?.heartbeats==null&&(this._heartbeatsCache=await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null)||this._heartbeatsCache.lastSentHeartbeatDate===r||this._heartbeatsCache.heartbeats.some(s=>s.date===r))return;if(this._heartbeatsCache.heartbeats.push({date:r,agent:t}),this._heartbeatsCache.heartbeats.length>Nh){const s=Lh(this._heartbeatsCache.heartbeats);this._heartbeatsCache.heartbeats.splice(s,1)}return this._storage.overwrite(this._heartbeatsCache)}catch(e){ut.warn(e)}}async getHeartbeatsHeader(){try{if(this._heartbeatsCache===null&&await this._heartbeatsCachePromise,this._heartbeatsCache?.heartbeats==null||this._heartbeatsCache.heartbeats.length===0)return"";const e=qo(),{heartbeatsToSend:t,unsentEntries:r}=Mh(this._heartbeatsCache.heartbeats),s=Nr(JSON.stringify({version:2,heartbeats:t}));return this._heartbeatsCache.lastSentHeartbeatDate=e,r.length>0?(this._heartbeatsCache.heartbeats=r,await this._storage.overwrite(this._heartbeatsCache)):(this._heartbeatsCache.heartbeats=[],this._storage.overwrite(this._heartbeatsCache)),s}catch(e){return ut.warn(e),""}}}function qo(){return new Date().toISOString().substring(0,10)}function Mh(n,e=kh){const t=[];let r=n.slice();for(const s of n){const o=t.find(a=>a.agent===s.agent);if(o){if(o.dates.push(s.date),Go(t)>e){o.dates.pop();break}}else if(t.push({agent:s.agent,dates:[s.date]}),Go(t)>e){t.pop();break}r=r.slice(1)}return{heartbeatsToSend:t,unsentEntries:r}}class Oh{constructor(e){this.app=e,this._canUseIndexedDBPromise=this.runIndexedDBEnvironmentCheck()}async runIndexedDBEnvironmentCheck(){return Iu()?bu().then(()=>!0).catch(()=>!1):!1}async read(){if(await this._canUseIndexedDBPromise){const t=await Dh(this.app);return t?.heartbeats?t:{heartbeats:[]}}else return{heartbeats:[]}}async overwrite(e){if(await this._canUseIndexedDBPromise){const r=await this.read();return $o(this.app,{lastSentHeartbeatDate:e.lastSentHeartbeatDate??r.lastSentHeartbeatDate,heartbeats:e.heartbeats})}else return}async add(e){if(await this._canUseIndexedDBPromise){const r=await this.read();return $o(this.app,{lastSentHeartbeatDate:e.lastSentHeartbeatDate??r.lastSentHeartbeatDate,heartbeats:[...r.heartbeats,...e.heartbeats]})}else return}}function Go(n){return Nr(JSON.stringify({version:2,heartbeats:n})).length}function Lh(n){if(n.length===0)return-1;let e=0,t=n[0].date;for(let r=1;r<n.length;r++)n[r].date<t&&(t=n[r].date,e=r);return e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Uh(n){Or(new Jn("platform-logger",e=>new Ku(e),"PRIVATE")),Or(new Jn("heartbeat",e=>new Fh(e),"PRIVATE")),rn(Os,jo,n),rn(Os,jo,"esm2020"),rn("fire-js","")}Uh("");var Bh="firebase",jh="12.3.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */rn(Bh,jh,"app");var Ho=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};/** @license
Copyright The Closure Library Authors.
SPDX-License-Identifier: Apache-2.0
*/var bt,ol;(function(){var n;/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/function e(w,g){function _(){}_.prototype=g.prototype,w.F=g.prototype,w.prototype=new _,w.prototype.constructor=w,w.D=function(T,v,b){for(var y=Array(arguments.length-2),ve=2;ve<arguments.length;ve++)y[ve-2]=arguments[ve];return g.prototype[v].apply(T,y)}}function t(){this.blockSize=-1}function r(){this.blockSize=-1,this.blockSize=64,this.g=Array(4),this.C=Array(this.blockSize),this.o=this.h=0,this.u()}e(r,t),r.prototype.u=function(){this.g[0]=1732584193,this.g[1]=4023233417,this.g[2]=2562383102,this.g[3]=271733878,this.o=this.h=0};function s(w,g,_){_||(_=0);const T=Array(16);if(typeof g=="string")for(var v=0;v<16;++v)T[v]=g.charCodeAt(_++)|g.charCodeAt(_++)<<8|g.charCodeAt(_++)<<16|g.charCodeAt(_++)<<24;else for(v=0;v<16;++v)T[v]=g[_++]|g[_++]<<8|g[_++]<<16|g[_++]<<24;g=w.g[0],_=w.g[1],v=w.g[2];let b=w.g[3],y;y=g+(b^_&(v^b))+T[0]+3614090360&4294967295,g=_+(y<<7&4294967295|y>>>25),y=b+(v^g&(_^v))+T[1]+3905402710&4294967295,b=g+(y<<12&4294967295|y>>>20),y=v+(_^b&(g^_))+T[2]+606105819&4294967295,v=b+(y<<17&4294967295|y>>>15),y=_+(g^v&(b^g))+T[3]+3250441966&4294967295,_=v+(y<<22&4294967295|y>>>10),y=g+(b^_&(v^b))+T[4]+4118548399&4294967295,g=_+(y<<7&4294967295|y>>>25),y=b+(v^g&(_^v))+T[5]+1200080426&4294967295,b=g+(y<<12&4294967295|y>>>20),y=v+(_^b&(g^_))+T[6]+2821735955&4294967295,v=b+(y<<17&4294967295|y>>>15),y=_+(g^v&(b^g))+T[7]+4249261313&4294967295,_=v+(y<<22&4294967295|y>>>10),y=g+(b^_&(v^b))+T[8]+1770035416&4294967295,g=_+(y<<7&4294967295|y>>>25),y=b+(v^g&(_^v))+T[9]+2336552879&4294967295,b=g+(y<<12&4294967295|y>>>20),y=v+(_^b&(g^_))+T[10]+4294925233&4294967295,v=b+(y<<17&4294967295|y>>>15),y=_+(g^v&(b^g))+T[11]+2304563134&4294967295,_=v+(y<<22&4294967295|y>>>10),y=g+(b^_&(v^b))+T[12]+1804603682&4294967295,g=_+(y<<7&4294967295|y>>>25),y=b+(v^g&(_^v))+T[13]+4254626195&4294967295,b=g+(y<<12&4294967295|y>>>20),y=v+(_^b&(g^_))+T[14]+2792965006&4294967295,v=b+(y<<17&4294967295|y>>>15),y=_+(g^v&(b^g))+T[15]+1236535329&4294967295,_=v+(y<<22&4294967295|y>>>10),y=g+(v^b&(_^v))+T[1]+4129170786&4294967295,g=_+(y<<5&4294967295|y>>>27),y=b+(_^v&(g^_))+T[6]+3225465664&4294967295,b=g+(y<<9&4294967295|y>>>23),y=v+(g^_&(b^g))+T[11]+643717713&4294967295,v=b+(y<<14&4294967295|y>>>18),y=_+(b^g&(v^b))+T[0]+3921069994&4294967295,_=v+(y<<20&4294967295|y>>>12),y=g+(v^b&(_^v))+T[5]+3593408605&4294967295,g=_+(y<<5&4294967295|y>>>27),y=b+(_^v&(g^_))+T[10]+38016083&4294967295,b=g+(y<<9&4294967295|y>>>23),y=v+(g^_&(b^g))+T[15]+3634488961&4294967295,v=b+(y<<14&4294967295|y>>>18),y=_+(b^g&(v^b))+T[4]+3889429448&4294967295,_=v+(y<<20&4294967295|y>>>12),y=g+(v^b&(_^v))+T[9]+568446438&4294967295,g=_+(y<<5&4294967295|y>>>27),y=b+(_^v&(g^_))+T[14]+3275163606&4294967295,b=g+(y<<9&4294967295|y>>>23),y=v+(g^_&(b^g))+T[3]+4107603335&4294967295,v=b+(y<<14&4294967295|y>>>18),y=_+(b^g&(v^b))+T[8]+1163531501&4294967295,_=v+(y<<20&4294967295|y>>>12),y=g+(v^b&(_^v))+T[13]+2850285829&4294967295,g=_+(y<<5&4294967295|y>>>27),y=b+(_^v&(g^_))+T[2]+4243563512&4294967295,b=g+(y<<9&4294967295|y>>>23),y=v+(g^_&(b^g))+T[7]+1735328473&4294967295,v=b+(y<<14&4294967295|y>>>18),y=_+(b^g&(v^b))+T[12]+2368359562&4294967295,_=v+(y<<20&4294967295|y>>>12),y=g+(_^v^b)+T[5]+4294588738&4294967295,g=_+(y<<4&4294967295|y>>>28),y=b+(g^_^v)+T[8]+2272392833&4294967295,b=g+(y<<11&4294967295|y>>>21),y=v+(b^g^_)+T[11]+1839030562&4294967295,v=b+(y<<16&4294967295|y>>>16),y=_+(v^b^g)+T[14]+4259657740&4294967295,_=v+(y<<23&4294967295|y>>>9),y=g+(_^v^b)+T[1]+2763975236&4294967295,g=_+(y<<4&4294967295|y>>>28),y=b+(g^_^v)+T[4]+1272893353&4294967295,b=g+(y<<11&4294967295|y>>>21),y=v+(b^g^_)+T[7]+4139469664&4294967295,v=b+(y<<16&4294967295|y>>>16),y=_+(v^b^g)+T[10]+3200236656&4294967295,_=v+(y<<23&4294967295|y>>>9),y=g+(_^v^b)+T[13]+681279174&4294967295,g=_+(y<<4&4294967295|y>>>28),y=b+(g^_^v)+T[0]+3936430074&4294967295,b=g+(y<<11&4294967295|y>>>21),y=v+(b^g^_)+T[3]+3572445317&4294967295,v=b+(y<<16&4294967295|y>>>16),y=_+(v^b^g)+T[6]+76029189&4294967295,_=v+(y<<23&4294967295|y>>>9),y=g+(_^v^b)+T[9]+3654602809&4294967295,g=_+(y<<4&4294967295|y>>>28),y=b+(g^_^v)+T[12]+3873151461&4294967295,b=g+(y<<11&4294967295|y>>>21),y=v+(b^g^_)+T[15]+530742520&4294967295,v=b+(y<<16&4294967295|y>>>16),y=_+(v^b^g)+T[2]+3299628645&4294967295,_=v+(y<<23&4294967295|y>>>9),y=g+(v^(_|~b))+T[0]+4096336452&4294967295,g=_+(y<<6&4294967295|y>>>26),y=b+(_^(g|~v))+T[7]+1126891415&4294967295,b=g+(y<<10&4294967295|y>>>22),y=v+(g^(b|~_))+T[14]+2878612391&4294967295,v=b+(y<<15&4294967295|y>>>17),y=_+(b^(v|~g))+T[5]+4237533241&4294967295,_=v+(y<<21&4294967295|y>>>11),y=g+(v^(_|~b))+T[12]+1700485571&4294967295,g=_+(y<<6&4294967295|y>>>26),y=b+(_^(g|~v))+T[3]+2399980690&4294967295,b=g+(y<<10&4294967295|y>>>22),y=v+(g^(b|~_))+T[10]+4293915773&4294967295,v=b+(y<<15&4294967295|y>>>17),y=_+(b^(v|~g))+T[1]+2240044497&4294967295,_=v+(y<<21&4294967295|y>>>11),y=g+(v^(_|~b))+T[8]+1873313359&4294967295,g=_+(y<<6&4294967295|y>>>26),y=b+(_^(g|~v))+T[15]+4264355552&4294967295,b=g+(y<<10&4294967295|y>>>22),y=v+(g^(b|~_))+T[6]+2734768916&4294967295,v=b+(y<<15&4294967295|y>>>17),y=_+(b^(v|~g))+T[13]+1309151649&4294967295,_=v+(y<<21&4294967295|y>>>11),y=g+(v^(_|~b))+T[4]+4149444226&4294967295,g=_+(y<<6&4294967295|y>>>26),y=b+(_^(g|~v))+T[11]+3174756917&4294967295,b=g+(y<<10&4294967295|y>>>22),y=v+(g^(b|~_))+T[2]+718787259&4294967295,v=b+(y<<15&4294967295|y>>>17),y=_+(b^(v|~g))+T[9]+3951481745&4294967295,w.g[0]=w.g[0]+g&4294967295,w.g[1]=w.g[1]+(v+(y<<21&4294967295|y>>>11))&4294967295,w.g[2]=w.g[2]+v&4294967295,w.g[3]=w.g[3]+b&4294967295}r.prototype.v=function(w,g){g===void 0&&(g=w.length);const _=g-this.blockSize,T=this.C;let v=this.h,b=0;for(;b<g;){if(v==0)for(;b<=_;)s(this,w,b),b+=this.blockSize;if(typeof w=="string"){for(;b<g;)if(T[v++]=w.charCodeAt(b++),v==this.blockSize){s(this,T),v=0;break}}else for(;b<g;)if(T[v++]=w[b++],v==this.blockSize){s(this,T),v=0;break}}this.h=v,this.o+=g},r.prototype.A=function(){var w=Array((this.h<56?this.blockSize:this.blockSize*2)-this.h);w[0]=128;for(var g=1;g<w.length-8;++g)w[g]=0;g=this.o*8;for(var _=w.length-8;_<w.length;++_)w[_]=g&255,g/=256;for(this.v(w),w=Array(16),g=0,_=0;_<4;++_)for(let T=0;T<32;T+=8)w[g++]=this.g[_]>>>T&255;return w};function o(w,g){var _=c;return Object.prototype.hasOwnProperty.call(_,w)?_[w]:_[w]=g(w)}function a(w,g){this.h=g;const _=[];let T=!0;for(let v=w.length-1;v>=0;v--){const b=w[v]|0;T&&b==g||(_[v]=b,T=!1)}this.g=_}var c={};function h(w){return-128<=w&&w<128?o(w,function(g){return new a([g|0],g<0?-1:0)}):new a([w|0],w<0?-1:0)}function d(w){if(isNaN(w)||!isFinite(w))return m;if(w<0)return F(d(-w));const g=[];let _=1;for(let T=0;w>=_;T++)g[T]=w/_|0,_*=4294967296;return new a(g,0)}function p(w,g){if(w.length==0)throw Error("number format error: empty string");if(g=g||10,g<2||36<g)throw Error("radix out of range: "+g);if(w.charAt(0)=="-")return F(p(w.substring(1),g));if(w.indexOf("-")>=0)throw Error('number format error: interior "-" character');const _=d(Math.pow(g,8));let T=m;for(let b=0;b<w.length;b+=8){var v=Math.min(8,w.length-b);const y=parseInt(w.substring(b,b+v),g);v<8?(v=d(Math.pow(g,v)),T=T.j(v).add(d(y))):(T=T.j(_),T=T.add(d(y)))}return T}var m=h(0),I=h(1),R=h(16777216);n=a.prototype,n.m=function(){if(z(this))return-F(this).m();let w=0,g=1;for(let _=0;_<this.g.length;_++){const T=this.i(_);w+=(T>=0?T:4294967296+T)*g,g*=4294967296}return w},n.toString=function(w){if(w=w||10,w<2||36<w)throw Error("radix out of range: "+w);if(L(this))return"0";if(z(this))return"-"+F(this).toString(w);const g=d(Math.pow(w,6));var _=this;let T="";for(;;){const v=xe(_,g).g;_=X(_,v.j(g));let b=((_.g.length>0?_.g[0]:_.h)>>>0).toString(w);if(_=v,L(_))return b+T;for(;b.length<6;)b="0"+b;T=b+T}},n.i=function(w){return w<0?0:w<this.g.length?this.g[w]:this.h};function L(w){if(w.h!=0)return!1;for(let g=0;g<w.g.length;g++)if(w.g[g]!=0)return!1;return!0}function z(w){return w.h==-1}n.l=function(w){return w=X(this,w),z(w)?-1:L(w)?0:1};function F(w){const g=w.g.length,_=[];for(let T=0;T<g;T++)_[T]=~w.g[T];return new a(_,~w.h).add(I)}n.abs=function(){return z(this)?F(this):this},n.add=function(w){const g=Math.max(this.g.length,w.g.length),_=[];let T=0;for(let v=0;v<=g;v++){let b=T+(this.i(v)&65535)+(w.i(v)&65535),y=(b>>>16)+(this.i(v)>>>16)+(w.i(v)>>>16);T=y>>>16,b&=65535,y&=65535,_[v]=y<<16|b}return new a(_,_[_.length-1]&-2147483648?-1:0)};function X(w,g){return w.add(F(g))}n.j=function(w){if(L(this)||L(w))return m;if(z(this))return z(w)?F(this).j(F(w)):F(F(this).j(w));if(z(w))return F(this.j(F(w)));if(this.l(R)<0&&w.l(R)<0)return d(this.m()*w.m());const g=this.g.length+w.g.length,_=[];for(var T=0;T<2*g;T++)_[T]=0;for(T=0;T<this.g.length;T++)for(let v=0;v<w.g.length;v++){const b=this.i(T)>>>16,y=this.i(T)&65535,ve=w.i(v)>>>16,Ke=w.i(v)&65535;_[2*T+2*v]+=y*Ke,oe(_,2*T+2*v),_[2*T+2*v+1]+=b*Ke,oe(_,2*T+2*v+1),_[2*T+2*v+1]+=y*ve,oe(_,2*T+2*v+1),_[2*T+2*v+2]+=b*ve,oe(_,2*T+2*v+2)}for(w=0;w<g;w++)_[w]=_[2*w+1]<<16|_[2*w];for(w=g;w<2*g;w++)_[w]=0;return new a(_,0)};function oe(w,g){for(;(w[g]&65535)!=w[g];)w[g+1]+=w[g]>>>16,w[g]&=65535,g++}function ie(w,g){this.g=w,this.h=g}function xe(w,g){if(L(g))throw Error("division by zero");if(L(w))return new ie(m,m);if(z(w))return g=xe(F(w),g),new ie(F(g.g),F(g.h));if(z(g))return g=xe(w,F(g)),new ie(F(g.g),g.h);if(w.g.length>30){if(z(w)||z(g))throw Error("slowDivide_ only works with positive integers.");for(var _=I,T=g;T.l(w)<=0;)_=Se(_),T=Se(T);var v=me(_,1),b=me(T,1);for(T=me(T,2),_=me(_,2);!L(T);){var y=b.add(T);y.l(w)<=0&&(v=v.add(_),b=y),T=me(T,1),_=me(_,1)}return g=X(w,v.j(g)),new ie(v,g)}for(v=m;w.l(g)>=0;){for(_=Math.max(1,Math.floor(w.m()/g.m())),T=Math.ceil(Math.log(_)/Math.LN2),T=T<=48?1:Math.pow(2,T-48),b=d(_),y=b.j(g);z(y)||y.l(w)>0;)_-=T,b=d(_),y=b.j(g);L(b)&&(b=I),v=v.add(b),w=X(w,y)}return new ie(v,w)}n.B=function(w){return xe(this,w).h},n.and=function(w){const g=Math.max(this.g.length,w.g.length),_=[];for(let T=0;T<g;T++)_[T]=this.i(T)&w.i(T);return new a(_,this.h&w.h)},n.or=function(w){const g=Math.max(this.g.length,w.g.length),_=[];for(let T=0;T<g;T++)_[T]=this.i(T)|w.i(T);return new a(_,this.h|w.h)},n.xor=function(w){const g=Math.max(this.g.length,w.g.length),_=[];for(let T=0;T<g;T++)_[T]=this.i(T)^w.i(T);return new a(_,this.h^w.h)};function Se(w){const g=w.g.length+1,_=[];for(let T=0;T<g;T++)_[T]=w.i(T)<<1|w.i(T-1)>>>31;return new a(_,w.h)}function me(w,g){const _=g>>5;g%=32;const T=w.g.length-_,v=[];for(let b=0;b<T;b++)v[b]=g>0?w.i(b+_)>>>g|w.i(b+_+1)<<32-g:w.i(b+_);return new a(v,w.h)}r.prototype.digest=r.prototype.A,r.prototype.reset=r.prototype.u,r.prototype.update=r.prototype.v,ol=r,a.prototype.add=a.prototype.add,a.prototype.multiply=a.prototype.j,a.prototype.modulo=a.prototype.B,a.prototype.compare=a.prototype.l,a.prototype.toNumber=a.prototype.m,a.prototype.toString=a.prototype.toString,a.prototype.getBits=a.prototype.i,a.fromNumber=d,a.fromString=p,bt=a}).apply(typeof Ho<"u"?Ho:typeof self<"u"?self:typeof window<"u"?window:{});var wr=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};/** @license
Copyright The Closure Library Authors.
SPDX-License-Identifier: Apache-2.0
*/var al,zn,ll,Cr,Bs,cl,ul,hl;(function(){var n,e=Object.defineProperty;function t(i){i=[typeof globalThis=="object"&&globalThis,i,typeof window=="object"&&window,typeof self=="object"&&self,typeof wr=="object"&&wr];for(var l=0;l<i.length;++l){var u=i[l];if(u&&u.Math==Math)return u}throw Error("Cannot find global object")}var r=t(this);function s(i,l){if(l)e:{var u=r;i=i.split(".");for(var f=0;f<i.length-1;f++){var A=i[f];if(!(A in u))break e;u=u[A]}i=i[i.length-1],f=u[i],l=l(f),l!=f&&l!=null&&e(u,i,{configurable:!0,writable:!0,value:l})}}s("Symbol.dispose",function(i){return i||Symbol("Symbol.dispose")}),s("Array.prototype.values",function(i){return i||function(){return this[Symbol.iterator]()}}),s("Object.entries",function(i){return i||function(l){var u=[],f;for(f in l)Object.prototype.hasOwnProperty.call(l,f)&&u.push([f,l[f]]);return u}});/** @license

 Copyright The Closure Library Authors.
 SPDX-License-Identifier: Apache-2.0
*/var o=o||{},a=this||self;function c(i){var l=typeof i;return l=="object"&&i!=null||l=="function"}function h(i,l,u){return i.call.apply(i.bind,arguments)}function d(i,l,u){return d=h,d.apply(null,arguments)}function p(i,l){var u=Array.prototype.slice.call(arguments,1);return function(){var f=u.slice();return f.push.apply(f,arguments),i.apply(this,f)}}function m(i,l){function u(){}u.prototype=l.prototype,i.Z=l.prototype,i.prototype=new u,i.prototype.constructor=i,i.Ob=function(f,A,S){for(var N=Array(arguments.length-2),Y=2;Y<arguments.length;Y++)N[Y-2]=arguments[Y];return l.prototype[A].apply(f,N)}}var I=typeof AsyncContext<"u"&&typeof AsyncContext.Snapshot=="function"?i=>i&&AsyncContext.Snapshot.wrap(i):i=>i;function R(i){const l=i.length;if(l>0){const u=Array(l);for(let f=0;f<l;f++)u[f]=i[f];return u}return[]}function L(i,l){for(let f=1;f<arguments.length;f++){const A=arguments[f];var u=typeof A;if(u=u!="object"?u:A?Array.isArray(A)?"array":u:"null",u=="array"||u=="object"&&typeof A.length=="number"){u=i.length||0;const S=A.length||0;i.length=u+S;for(let N=0;N<S;N++)i[u+N]=A[N]}else i.push(A)}}class z{constructor(l,u){this.i=l,this.j=u,this.h=0,this.g=null}get(){let l;return this.h>0?(this.h--,l=this.g,this.g=l.next,l.next=null):l=this.i(),l}}function F(i){a.setTimeout(()=>{throw i},0)}function X(){var i=w;let l=null;return i.g&&(l=i.g,i.g=i.g.next,i.g||(i.h=null),l.next=null),l}class oe{constructor(){this.h=this.g=null}add(l,u){const f=ie.get();f.set(l,u),this.h?this.h.next=f:this.g=f,this.h=f}}var ie=new z(()=>new xe,i=>i.reset());class xe{constructor(){this.next=this.g=this.h=null}set(l,u){this.h=l,this.g=u,this.next=null}reset(){this.next=this.g=this.h=null}}let Se,me=!1,w=new oe,g=()=>{const i=Promise.resolve(void 0);Se=()=>{i.then(_)}};function _(){for(var i;i=X();){try{i.h.call(i.g)}catch(u){F(u)}var l=ie;l.j(i),l.h<100&&(l.h++,i.next=l.g,l.g=i)}me=!1}function T(){this.u=this.u,this.C=this.C}T.prototype.u=!1,T.prototype.dispose=function(){this.u||(this.u=!0,this.N())},T.prototype[Symbol.dispose]=function(){this.dispose()},T.prototype.N=function(){if(this.C)for(;this.C.length;)this.C.shift()()};function v(i,l){this.type=i,this.g=this.target=l,this.defaultPrevented=!1}v.prototype.h=function(){this.defaultPrevented=!0};var b=(function(){if(!a.addEventListener||!Object.defineProperty)return!1;var i=!1,l=Object.defineProperty({},"passive",{get:function(){i=!0}});try{const u=()=>{};a.addEventListener("test",u,l),a.removeEventListener("test",u,l)}catch{}return i})();function y(i){return/^[\s\xa0]*$/.test(i)}function ve(i,l){v.call(this,i?i.type:""),this.relatedTarget=this.g=this.target=null,this.button=this.screenY=this.screenX=this.clientY=this.clientX=0,this.key="",this.metaKey=this.shiftKey=this.altKey=this.ctrlKey=!1,this.state=null,this.pointerId=0,this.pointerType="",this.i=null,i&&this.init(i,l)}m(ve,v),ve.prototype.init=function(i,l){const u=this.type=i.type,f=i.changedTouches&&i.changedTouches.length?i.changedTouches[0]:null;this.target=i.target||i.srcElement,this.g=l,l=i.relatedTarget,l||(u=="mouseover"?l=i.fromElement:u=="mouseout"&&(l=i.toElement)),this.relatedTarget=l,f?(this.clientX=f.clientX!==void 0?f.clientX:f.pageX,this.clientY=f.clientY!==void 0?f.clientY:f.pageY,this.screenX=f.screenX||0,this.screenY=f.screenY||0):(this.clientX=i.clientX!==void 0?i.clientX:i.pageX,this.clientY=i.clientY!==void 0?i.clientY:i.pageY,this.screenX=i.screenX||0,this.screenY=i.screenY||0),this.button=i.button,this.key=i.key||"",this.ctrlKey=i.ctrlKey,this.altKey=i.altKey,this.shiftKey=i.shiftKey,this.metaKey=i.metaKey,this.pointerId=i.pointerId||0,this.pointerType=i.pointerType,this.state=i.state,this.i=i,i.defaultPrevented&&ve.Z.h.call(this)},ve.prototype.h=function(){ve.Z.h.call(this);const i=this.i;i.preventDefault?i.preventDefault():i.returnValue=!1};var Ke="closure_listenable_"+(Math.random()*1e6|0),Qe=0;function Vt(i,l,u,f,A){this.listener=i,this.proxy=null,this.src=l,this.type=u,this.capture=!!f,this.ha=A,this.key=++Qe,this.da=this.fa=!1}function Ze(i){i.da=!0,i.listener=null,i.proxy=null,i.src=null,i.ha=null}function dt(i,l,u){for(const f in i)l.call(u,i[f],f,i)}function In(i,l){for(const u in i)l.call(void 0,i[u],u,i)}function Gt(i){const l={};for(const u in i)l[u]=i[u];return l}const Ht="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");function C(i,l){let u,f;for(let A=1;A<arguments.length;A++){f=arguments[A];for(u in f)i[u]=f[u];for(let S=0;S<Ht.length;S++)u=Ht[S],Object.prototype.hasOwnProperty.call(f,u)&&(i[u]=f[u])}}function M(i){this.src=i,this.g={},this.h=0}M.prototype.add=function(i,l,u,f,A){const S=i.toString();i=this.g[S],i||(i=this.g[S]=[],this.h++);const N=x(i,l,f,A);return N>-1?(l=i[N],u||(l.fa=!1)):(l=new Vt(l,this.src,S,!!f,A),l.fa=u,i.push(l)),l};function O(i,l){const u=l.type;if(u in i.g){var f=i.g[u],A=Array.prototype.indexOf.call(f,l,void 0),S;(S=A>=0)&&Array.prototype.splice.call(f,A,1),S&&(Ze(l),i.g[u].length==0&&(delete i.g[u],i.h--))}}function x(i,l,u,f){for(let A=0;A<i.length;++A){const S=i[A];if(!S.da&&S.listener==l&&S.capture==!!u&&S.ha==f)return A}return-1}var $="closure_lm_"+(Math.random()*1e6|0),ce={};function ae(i,l,u,f,A){if(Array.isArray(l)){for(let S=0;S<l.length;S++)ae(i,l[S],u,f,A);return null}return u=Q(u),i&&i[Ke]?i.J(l,u,c(f)?!!f.capture:!1,A):et(i,l,u,!1,f,A)}function et(i,l,u,f,A,S){if(!l)throw Error("Invalid event type");const N=c(A)?!!A.capture:!!A;let Y=J(i);if(Y||(i[$]=Y=new M(i)),u=Y.add(l,u,f,N,S),u.proxy)return u;if(f=we(),u.proxy=f,f.src=i,f.listener=u,i.addEventListener)b||(A=N),A===void 0&&(A=!1),i.addEventListener(l.toString(),f,A);else if(i.attachEvent)i.attachEvent(he(l.toString()),f);else if(i.addListener&&i.removeListener)i.addListener(f);else throw Error("addEventListener and attachEvent are unavailable.");return u}function we(){function i(u){return l.call(i.src,i.listener,u)}const l=bn;return i}function Le(i,l,u,f,A){if(Array.isArray(l))for(var S=0;S<l.length;S++)Le(i,l[S],u,f,A);else f=c(f)?!!f.capture:!!f,u=Q(u),i&&i[Ke]?(i=i.i,S=String(l).toString(),S in i.g&&(l=i.g[S],u=x(l,u,f,A),u>-1&&(Ze(l[u]),Array.prototype.splice.call(l,u,1),l.length==0&&(delete i.g[S],i.h--)))):i&&(i=J(i))&&(l=i.g[l.toString()],i=-1,l&&(i=x(l,u,f,A)),(u=i>-1?l[i]:null)&&ge(u))}function ge(i){if(typeof i!="number"&&i&&!i.da){var l=i.src;if(l&&l[Ke])O(l.i,i);else{var u=i.type,f=i.proxy;l.removeEventListener?l.removeEventListener(u,f,i.capture):l.detachEvent?l.detachEvent(he(u),f):l.addListener&&l.removeListener&&l.removeListener(f),(u=J(l))?(O(u,i),u.h==0&&(u.src=null,l[$]=null)):Ze(i)}}}function he(i){return i in ce?ce[i]:ce[i]="on"+i}function bn(i,l){if(i.da)i=!0;else{l=new ve(l,this);const u=i.listener,f=i.ha||i.src;i.fa&&ge(i),i=u.call(f,l)}return i}function J(i){return i=i[$],i instanceof M?i:null}var k="__closure_events_fn_"+(Math.random()*1e9>>>0);function Q(i){return typeof i=="function"?i:(i[k]||(i[k]=function(l){return i.handleEvent(l)}),i[k])}function B(){T.call(this),this.i=new M(this),this.M=this,this.G=null}m(B,T),B.prototype[Ke]=!0,B.prototype.removeEventListener=function(i,l,u,f){Le(this,i,l,u,f)};function K(i,l){var u,f=i.G;if(f)for(u=[];f;f=f.G)u.push(f);if(i=i.M,f=l.type||l,typeof l=="string")l=new v(l,i);else if(l instanceof v)l.target=l.target||i;else{var A=l;l=new v(f,i),C(l,A)}A=!0;let S,N;if(u)for(N=u.length-1;N>=0;N--)S=l.g=u[N],A=de(S,f,!0,l)&&A;if(S=l.g=i,A=de(S,f,!0,l)&&A,A=de(S,f,!1,l)&&A,u)for(N=0;N<u.length;N++)S=l.g=u[N],A=de(S,f,!1,l)&&A}B.prototype.N=function(){if(B.Z.N.call(this),this.i){var i=this.i;for(const l in i.g){const u=i.g[l];for(let f=0;f<u.length;f++)Ze(u[f]);delete i.g[l],i.h--}}this.G=null},B.prototype.J=function(i,l,u,f){return this.i.add(String(i),l,!1,u,f)},B.prototype.K=function(i,l,u,f){return this.i.add(String(i),l,!0,u,f)};function de(i,l,u,f){if(l=i.i.g[String(l)],!l)return!0;l=l.concat();let A=!0;for(let S=0;S<l.length;++S){const N=l[S];if(N&&!N.da&&N.capture==u){const Y=N.listener,Ve=N.ha||N.src;N.fa&&O(i.i,N),A=Y.call(Ve,f)!==!1&&A}}return A&&!f.defaultPrevented}function Ye(i,l){if(typeof i!="function")if(i&&typeof i.handleEvent=="function")i=d(i.handleEvent,i);else throw Error("Invalid listener argument");return Number(l)>2147483647?-1:a.setTimeout(i,l||0)}function Dt(i){i.g=Ye(()=>{i.g=null,i.i&&(i.i=!1,Dt(i))},i.l);const l=i.h;i.h=null,i.m.apply(null,l)}class An extends T{constructor(l,u){super(),this.m=l,this.l=u,this.h=null,this.i=!1,this.g=null}j(l){this.h=arguments,this.g?this.i=!0:Dt(this)}N(){super.N(),this.g&&(a.clearTimeout(this.g),this.g=null,this.i=!1,this.h=null)}}function kt(i){T.call(this),this.h=i,this.g={}}m(kt,T);var Kt=[];function Wt(i){dt(i.g,function(l,u){this.g.hasOwnProperty(u)&&ge(l)},i),i.g={}}kt.prototype.N=function(){kt.Z.N.call(this),Wt(this)},kt.prototype.handleEvent=function(){throw Error("EventHandler.handleEvent not implemented")};var Qt=a.JSON.stringify,is=a.JSON.parse,os=class{stringify(i){return a.JSON.stringify(i,void 0)}parse(i){return a.JSON.parse(i,void 0)}};function cr(){}function ur(){}var ft={OPEN:"a",hb:"b",ERROR:"c",tb:"d"};function V(){v.call(this,"d")}m(V,v);function W(){v.call(this,"c")}m(W,v);var ye={},qe=null;function tt(){return qe=qe||new B}ye.Ia="serverreachability";function Sn(i){v.call(this,ye.Ia,i)}m(Sn,v);function Rn(i){const l=tt();K(l,new Sn(l))}ye.STAT_EVENT="statevent";function ji(i,l){v.call(this,ye.STAT_EVENT,i),this.stat=l}m(ji,v);function Ge(i){const l=tt();K(l,new ji(l,i))}ye.Ja="timingevent";function zi(i,l){v.call(this,ye.Ja,i),this.size=l}m(zi,v);function Cn(i,l){if(typeof i!="function")throw Error("Fn must not be null and must be a function");return a.setTimeout(function(){i()},l)}function Pn(){this.g=!0}Pn.prototype.ua=function(){this.g=!1};function Rc(i,l,u,f,A,S){i.info(function(){if(i.g)if(S){var N="",Y=S.split("&");for(let le=0;le<Y.length;le++){var Ve=Y[le].split("=");if(Ve.length>1){const ke=Ve[0];Ve=Ve[1];const rt=ke.split("_");N=rt.length>=2&&rt[1]=="type"?N+(ke+"="+Ve+"&"):N+(ke+"=redacted&")}}}else N=null;else N=S;return"XMLHTTP REQ ("+f+") [attempt "+A+"]: "+l+`
`+u+`
`+N})}function Cc(i,l,u,f,A,S,N){i.info(function(){return"XMLHTTP RESP ("+f+") [ attempt "+A+"]: "+l+`
`+u+`
`+S+" "+N})}function Yt(i,l,u,f){i.info(function(){return"XMLHTTP TEXT ("+l+"): "+xc(i,u)+(f?" "+f:"")})}function Pc(i,l){i.info(function(){return"TIMEOUT: "+l})}Pn.prototype.info=function(){};function xc(i,l){if(!i.g)return l;if(!l)return null;try{const S=JSON.parse(l);if(S){for(i=0;i<S.length;i++)if(Array.isArray(S[i])){var u=S[i];if(!(u.length<2)){var f=u[1];if(Array.isArray(f)&&!(f.length<1)){var A=f[0];if(A!="noop"&&A!="stop"&&A!="close")for(let N=1;N<f.length;N++)f[N]=""}}}}return Qt(S)}catch{return l}}var hr={NO_ERROR:0,cb:1,qb:2,pb:3,kb:4,ob:5,rb:6,Ga:7,TIMEOUT:8,ub:9},$i={ib:"complete",Fb:"success",ERROR:"error",Ga:"abort",xb:"ready",yb:"readystatechange",TIMEOUT:"timeout",sb:"incrementaldata",wb:"progress",lb:"downloadprogress",Nb:"uploadprogress"},qi;function as(){}m(as,cr),as.prototype.g=function(){return new XMLHttpRequest},qi=new as;function xn(i){return encodeURIComponent(String(i))}function Vc(i){var l=1;i=i.split(":");const u=[];for(;l>0&&i.length;)u.push(i.shift()),l--;return i.length&&u.push(i.join(":")),u}function pt(i,l,u,f){this.j=i,this.i=l,this.l=u,this.S=f||1,this.V=new kt(this),this.H=45e3,this.J=null,this.o=!1,this.u=this.B=this.A=this.M=this.F=this.T=this.D=null,this.G=[],this.g=null,this.C=0,this.m=this.v=null,this.X=-1,this.K=!1,this.P=0,this.O=null,this.W=this.L=this.U=this.R=!1,this.h=new Gi}function Gi(){this.i=null,this.g="",this.h=!1}var Hi={},ls={};function cs(i,l,u){i.M=1,i.A=fr(nt(l)),i.u=u,i.R=!0,Ki(i,null)}function Ki(i,l){i.F=Date.now(),dr(i),i.B=nt(i.A);var u=i.B,f=i.S;Array.isArray(f)||(f=[String(f)]),oo(u.i,"t",f),i.C=0,u=i.j.L,i.h=new Gi,i.g=Ao(i.j,u?l:null,!i.u),i.P>0&&(i.O=new An(d(i.Y,i,i.g),i.P)),l=i.V,u=i.g,f=i.ba;var A="readystatechange";Array.isArray(A)||(A&&(Kt[0]=A.toString()),A=Kt);for(let S=0;S<A.length;S++){const N=ae(u,A[S],f||l.handleEvent,!1,l.h||l);if(!N)break;l.g[N.key]=N}l=i.J?Gt(i.J):{},i.u?(i.v||(i.v="POST"),l["Content-Type"]="application/x-www-form-urlencoded",i.g.ea(i.B,i.v,i.u,l)):(i.v="GET",i.g.ea(i.B,i.v,null,l)),Rn(),Rc(i.i,i.v,i.B,i.l,i.S,i.u)}pt.prototype.ba=function(i){i=i.target;const l=this.O;l&&yt(i)==3?l.j():this.Y(i)},pt.prototype.Y=function(i){try{if(i==this.g)e:{const Y=yt(this.g),Ve=this.g.ya(),le=this.g.ca();if(!(Y<3)&&(Y!=3||this.g&&(this.h.h||this.g.la()||po(this.g)))){this.K||Y!=4||Ve==7||(Ve==8||le<=0?Rn(3):Rn(2)),us(this);var l=this.g.ca();this.X=l;var u=Dc(this);if(this.o=l==200,Cc(this.i,this.v,this.B,this.l,this.S,Y,l),this.o){if(this.U&&!this.L){t:{if(this.g){var f,A=this.g;if((f=A.g?A.g.getResponseHeader("X-HTTP-Initial-Response"):null)&&!y(f)){var S=f;break t}}S=null}if(i=S)Yt(this.i,this.l,i,"Initial handshake response via X-HTTP-Initial-Response"),this.L=!0,hs(this,i);else{this.o=!1,this.m=3,Ge(12),Nt(this),Vn(this);break e}}if(this.R){i=!0;let ke;for(;!this.K&&this.C<u.length;)if(ke=kc(this,u),ke==ls){Y==4&&(this.m=4,Ge(14),i=!1),Yt(this.i,this.l,null,"[Incomplete Response]");break}else if(ke==Hi){this.m=4,Ge(15),Yt(this.i,this.l,u,"[Invalid Chunk]"),i=!1;break}else Yt(this.i,this.l,ke,null),hs(this,ke);if(Wi(this)&&this.C!=0&&(this.h.g=this.h.g.slice(this.C),this.C=0),Y!=4||u.length!=0||this.h.h||(this.m=1,Ge(16),i=!1),this.o=this.o&&i,!i)Yt(this.i,this.l,u,"[Invalid Chunked Response]"),Nt(this),Vn(this);else if(u.length>0&&!this.W){this.W=!0;var N=this.j;N.g==this&&N.aa&&!N.P&&(N.j.info("Great, no buffering proxy detected. Bytes received: "+u.length),Es(N),N.P=!0,Ge(11))}}else Yt(this.i,this.l,u,null),hs(this,u);Y==4&&Nt(this),this.o&&!this.K&&(Y==4?To(this.j,this):(this.o=!1,dr(this)))}else Kc(this.g),l==400&&u.indexOf("Unknown SID")>0?(this.m=3,Ge(12)):(this.m=0,Ge(13)),Nt(this),Vn(this)}}}catch{}finally{}};function Dc(i){if(!Wi(i))return i.g.la();const l=po(i.g);if(l==="")return"";let u="";const f=l.length,A=yt(i.g)==4;if(!i.h.i){if(typeof TextDecoder>"u")return Nt(i),Vn(i),"";i.h.i=new a.TextDecoder}for(let S=0;S<f;S++)i.h.h=!0,u+=i.h.i.decode(l[S],{stream:!(A&&S==f-1)});return l.length=0,i.h.g+=u,i.C=0,i.h.g}function Wi(i){return i.g?i.v=="GET"&&i.M!=2&&i.j.Aa:!1}function kc(i,l){var u=i.C,f=l.indexOf(`
`,u);return f==-1?ls:(u=Number(l.substring(u,f)),isNaN(u)?Hi:(f+=1,f+u>l.length?ls:(l=l.slice(f,f+u),i.C=f+u,l)))}pt.prototype.cancel=function(){this.K=!0,Nt(this)};function dr(i){i.T=Date.now()+i.H,Qi(i,i.H)}function Qi(i,l){if(i.D!=null)throw Error("WatchDog timer not null");i.D=Cn(d(i.aa,i),l)}function us(i){i.D&&(a.clearTimeout(i.D),i.D=null)}pt.prototype.aa=function(){this.D=null;const i=Date.now();i-this.T>=0?(Pc(this.i,this.B),this.M!=2&&(Rn(),Ge(17)),Nt(this),this.m=2,Vn(this)):Qi(this,this.T-i)};function Vn(i){i.j.I==0||i.K||To(i.j,i)}function Nt(i){us(i);var l=i.O;l&&typeof l.dispose=="function"&&l.dispose(),i.O=null,Wt(i.V),i.g&&(l=i.g,i.g=null,l.abort(),l.dispose())}function hs(i,l){try{var u=i.j;if(u.I!=0&&(u.g==i||ds(u.h,i))){if(!i.L&&ds(u.h,i)&&u.I==3){try{var f=u.Ba.g.parse(l)}catch{f=null}if(Array.isArray(f)&&f.length==3){var A=f;if(A[0]==0){e:if(!u.v){if(u.g)if(u.g.F+3e3<i.F)_r(u),gr(u);else break e;_s(u),Ge(18)}}else u.xa=A[1],0<u.xa-u.K&&A[2]<37500&&u.F&&u.A==0&&!u.C&&(u.C=Cn(d(u.Va,u),6e3));Ji(u.h)<=1&&u.ta&&(u.ta=void 0)}else Mt(u,11)}else if((i.L||u.g==i)&&_r(u),!y(l))for(A=u.Ba.g.parse(l),l=0;l<A.length;l++){let le=A[l];const ke=le[0];if(!(ke<=u.K))if(u.K=ke,le=le[1],u.I==2)if(le[0]=="c"){u.M=le[1],u.ba=le[2];const rt=le[3];rt!=null&&(u.ka=rt,u.j.info("VER="+u.ka));const Ot=le[4];Ot!=null&&(u.za=Ot,u.j.info("SVER="+u.za));const _t=le[5];_t!=null&&typeof _t=="number"&&_t>0&&(f=1.5*_t,u.O=f,u.j.info("backChannelRequestTimeoutMs_="+f)),f=u;const Et=i.g;if(Et){const vr=Et.g?Et.g.getResponseHeader("X-Client-Wire-Protocol"):null;if(vr){var S=f.h;S.g||vr.indexOf("spdy")==-1&&vr.indexOf("quic")==-1&&vr.indexOf("h2")==-1||(S.j=S.l,S.g=new Set,S.h&&(fs(S,S.h),S.h=null))}if(f.G){const vs=Et.g?Et.g.getResponseHeader("X-HTTP-Session-Id"):null;vs&&(f.wa=vs,ue(f.J,f.G,vs))}}u.I=3,u.l&&u.l.ra(),u.aa&&(u.T=Date.now()-i.F,u.j.info("Handshake RTT: "+u.T+"ms")),f=u;var N=i;if(f.na=bo(f,f.L?f.ba:null,f.W),N.L){Zi(f.h,N);var Y=N,Ve=f.O;Ve&&(Y.H=Ve),Y.D&&(us(Y),dr(Y)),f.g=N}else Eo(f);u.i.length>0&&yr(u)}else le[0]!="stop"&&le[0]!="close"||Mt(u,7);else u.I==3&&(le[0]=="stop"||le[0]=="close"?le[0]=="stop"?Mt(u,7):ys(u):le[0]!="noop"&&u.l&&u.l.qa(le),u.A=0)}}Rn(4)}catch{}}var Nc=class{constructor(i,l){this.g=i,this.map=l}};function Yi(i){this.l=i||10,a.PerformanceNavigationTiming?(i=a.performance.getEntriesByType("navigation"),i=i.length>0&&(i[0].nextHopProtocol=="hq"||i[0].nextHopProtocol=="h2")):i=!!(a.chrome&&a.chrome.loadTimes&&a.chrome.loadTimes()&&a.chrome.loadTimes().wasFetchedViaSpdy),this.j=i?this.l:1,this.g=null,this.j>1&&(this.g=new Set),this.h=null,this.i=[]}function Xi(i){return i.h?!0:i.g?i.g.size>=i.j:!1}function Ji(i){return i.h?1:i.g?i.g.size:0}function ds(i,l){return i.h?i.h==l:i.g?i.g.has(l):!1}function fs(i,l){i.g?i.g.add(l):i.h=l}function Zi(i,l){i.h&&i.h==l?i.h=null:i.g&&i.g.has(l)&&i.g.delete(l)}Yi.prototype.cancel=function(){if(this.i=eo(this),this.h)this.h.cancel(),this.h=null;else if(this.g&&this.g.size!==0){for(const i of this.g.values())i.cancel();this.g.clear()}};function eo(i){if(i.h!=null)return i.i.concat(i.h.G);if(i.g!=null&&i.g.size!==0){let l=i.i;for(const u of i.g.values())l=l.concat(u.G);return l}return R(i.i)}var to=RegExp("^(?:([^:/?#.]+):)?(?://(?:([^\\\\/?#]*)@)?([^\\\\/?#]*?)(?::([0-9]+))?(?=[\\\\/?#]|$))?([^?#]+)?(?:\\?([^#]*))?(?:#([\\s\\S]*))?$");function Fc(i,l){if(i){i=i.split("&");for(let u=0;u<i.length;u++){const f=i[u].indexOf("=");let A,S=null;f>=0?(A=i[u].substring(0,f),S=i[u].substring(f+1)):A=i[u],l(A,S?decodeURIComponent(S.replace(/\+/g," ")):"")}}}function mt(i){this.g=this.o=this.j="",this.u=null,this.m=this.h="",this.l=!1;let l;i instanceof mt?(this.l=i.l,Dn(this,i.j),this.o=i.o,this.g=i.g,kn(this,i.u),this.h=i.h,ps(this,ao(i.i)),this.m=i.m):i&&(l=String(i).match(to))?(this.l=!1,Dn(this,l[1]||"",!0),this.o=Nn(l[2]||""),this.g=Nn(l[3]||"",!0),kn(this,l[4]),this.h=Nn(l[5]||"",!0),ps(this,l[6]||"",!0),this.m=Nn(l[7]||"")):(this.l=!1,this.i=new Mn(null,this.l))}mt.prototype.toString=function(){const i=[];var l=this.j;l&&i.push(Fn(l,no,!0),":");var u=this.g;return(u||l=="file")&&(i.push("//"),(l=this.o)&&i.push(Fn(l,no,!0),"@"),i.push(xn(u).replace(/%25([0-9a-fA-F]{2})/g,"%$1")),u=this.u,u!=null&&i.push(":",String(u))),(u=this.h)&&(this.g&&u.charAt(0)!="/"&&i.push("/"),i.push(Fn(u,u.charAt(0)=="/"?Lc:Oc,!0))),(u=this.i.toString())&&i.push("?",u),(u=this.m)&&i.push("#",Fn(u,Bc)),i.join("")},mt.prototype.resolve=function(i){const l=nt(this);let u=!!i.j;u?Dn(l,i.j):u=!!i.o,u?l.o=i.o:u=!!i.g,u?l.g=i.g:u=i.u!=null;var f=i.h;if(u)kn(l,i.u);else if(u=!!i.h){if(f.charAt(0)!="/")if(this.g&&!this.h)f="/"+f;else{var A=l.h.lastIndexOf("/");A!=-1&&(f=l.h.slice(0,A+1)+f)}if(A=f,A==".."||A==".")f="";else if(A.indexOf("./")!=-1||A.indexOf("/.")!=-1){f=A.lastIndexOf("/",0)==0,A=A.split("/");const S=[];for(let N=0;N<A.length;){const Y=A[N++];Y=="."?f&&N==A.length&&S.push(""):Y==".."?((S.length>1||S.length==1&&S[0]!="")&&S.pop(),f&&N==A.length&&S.push("")):(S.push(Y),f=!0)}f=S.join("/")}else f=A}return u?l.h=f:u=i.i.toString()!=="",u?ps(l,ao(i.i)):u=!!i.m,u&&(l.m=i.m),l};function nt(i){return new mt(i)}function Dn(i,l,u){i.j=u?Nn(l,!0):l,i.j&&(i.j=i.j.replace(/:$/,""))}function kn(i,l){if(l){if(l=Number(l),isNaN(l)||l<0)throw Error("Bad port number "+l);i.u=l}else i.u=null}function ps(i,l,u){l instanceof Mn?(i.i=l,jc(i.i,i.l)):(u||(l=Fn(l,Uc)),i.i=new Mn(l,i.l))}function ue(i,l,u){i.i.set(l,u)}function fr(i){return ue(i,"zx",Math.floor(Math.random()*2147483648).toString(36)+Math.abs(Math.floor(Math.random()*2147483648)^Date.now()).toString(36)),i}function Nn(i,l){return i?l?decodeURI(i.replace(/%25/g,"%2525")):decodeURIComponent(i):""}function Fn(i,l,u){return typeof i=="string"?(i=encodeURI(i).replace(l,Mc),u&&(i=i.replace(/%25([0-9a-fA-F]{2})/g,"%$1")),i):null}function Mc(i){return i=i.charCodeAt(0),"%"+(i>>4&15).toString(16)+(i&15).toString(16)}var no=/[#\/\?@]/g,Oc=/[#\?:]/g,Lc=/[#\?]/g,Uc=/[#\?@]/g,Bc=/#/g;function Mn(i,l){this.h=this.g=null,this.i=i||null,this.j=!!l}function Ft(i){i.g||(i.g=new Map,i.h=0,i.i&&Fc(i.i,function(l,u){i.add(decodeURIComponent(l.replace(/\+/g," ")),u)}))}n=Mn.prototype,n.add=function(i,l){Ft(this),this.i=null,i=Xt(this,i);let u=this.g.get(i);return u||this.g.set(i,u=[]),u.push(l),this.h+=1,this};function ro(i,l){Ft(i),l=Xt(i,l),i.g.has(l)&&(i.i=null,i.h-=i.g.get(l).length,i.g.delete(l))}function so(i,l){return Ft(i),l=Xt(i,l),i.g.has(l)}n.forEach=function(i,l){Ft(this),this.g.forEach(function(u,f){u.forEach(function(A){i.call(l,A,f,this)},this)},this)};function io(i,l){Ft(i);let u=[];if(typeof l=="string")so(i,l)&&(u=u.concat(i.g.get(Xt(i,l))));else for(i=Array.from(i.g.values()),l=0;l<i.length;l++)u=u.concat(i[l]);return u}n.set=function(i,l){return Ft(this),this.i=null,i=Xt(this,i),so(this,i)&&(this.h-=this.g.get(i).length),this.g.set(i,[l]),this.h+=1,this},n.get=function(i,l){return i?(i=io(this,i),i.length>0?String(i[0]):l):l};function oo(i,l,u){ro(i,l),u.length>0&&(i.i=null,i.g.set(Xt(i,l),R(u)),i.h+=u.length)}n.toString=function(){if(this.i)return this.i;if(!this.g)return"";const i=[],l=Array.from(this.g.keys());for(let f=0;f<l.length;f++){var u=l[f];const A=xn(u);u=io(this,u);for(let S=0;S<u.length;S++){let N=A;u[S]!==""&&(N+="="+xn(u[S])),i.push(N)}}return this.i=i.join("&")};function ao(i){const l=new Mn;return l.i=i.i,i.g&&(l.g=new Map(i.g),l.h=i.h),l}function Xt(i,l){return l=String(l),i.j&&(l=l.toLowerCase()),l}function jc(i,l){l&&!i.j&&(Ft(i),i.i=null,i.g.forEach(function(u,f){const A=f.toLowerCase();f!=A&&(ro(this,f),oo(this,A,u))},i)),i.j=l}function zc(i,l){const u=new Pn;if(a.Image){const f=new Image;f.onload=p(gt,u,"TestLoadImage: loaded",!0,l,f),f.onerror=p(gt,u,"TestLoadImage: error",!1,l,f),f.onabort=p(gt,u,"TestLoadImage: abort",!1,l,f),f.ontimeout=p(gt,u,"TestLoadImage: timeout",!1,l,f),a.setTimeout(function(){f.ontimeout&&f.ontimeout()},1e4),f.src=i}else l(!1)}function $c(i,l){const u=new Pn,f=new AbortController,A=setTimeout(()=>{f.abort(),gt(u,"TestPingServer: timeout",!1,l)},1e4);fetch(i,{signal:f.signal}).then(S=>{clearTimeout(A),S.ok?gt(u,"TestPingServer: ok",!0,l):gt(u,"TestPingServer: server error",!1,l)}).catch(()=>{clearTimeout(A),gt(u,"TestPingServer: error",!1,l)})}function gt(i,l,u,f,A){try{A&&(A.onload=null,A.onerror=null,A.onabort=null,A.ontimeout=null),f(u)}catch{}}function qc(){this.g=new os}function ms(i){this.i=i.Sb||null,this.h=i.ab||!1}m(ms,cr),ms.prototype.g=function(){return new pr(this.i,this.h)};function pr(i,l){B.call(this),this.H=i,this.o=l,this.m=void 0,this.status=this.readyState=0,this.responseType=this.responseText=this.response=this.statusText="",this.onreadystatechange=null,this.A=new Headers,this.h=null,this.F="GET",this.D="",this.g=!1,this.B=this.j=this.l=null,this.v=new AbortController}m(pr,B),n=pr.prototype,n.open=function(i,l){if(this.readyState!=0)throw this.abort(),Error("Error reopening a connection");this.F=i,this.D=l,this.readyState=1,Ln(this)},n.send=function(i){if(this.readyState!=1)throw this.abort(),Error("need to call open() first. ");if(this.v.signal.aborted)throw this.abort(),Error("Request was aborted.");this.g=!0;const l={headers:this.A,method:this.F,credentials:this.m,cache:void 0,signal:this.v.signal};i&&(l.body=i),(this.H||a).fetch(new Request(this.D,l)).then(this.Pa.bind(this),this.ga.bind(this))},n.abort=function(){this.response=this.responseText="",this.A=new Headers,this.status=0,this.v.abort(),this.j&&this.j.cancel("Request was aborted.").catch(()=>{}),this.readyState>=1&&this.g&&this.readyState!=4&&(this.g=!1,On(this)),this.readyState=0},n.Pa=function(i){if(this.g&&(this.l=i,this.h||(this.status=this.l.status,this.statusText=this.l.statusText,this.h=i.headers,this.readyState=2,Ln(this)),this.g&&(this.readyState=3,Ln(this),this.g)))if(this.responseType==="arraybuffer")i.arrayBuffer().then(this.Na.bind(this),this.ga.bind(this));else if(typeof a.ReadableStream<"u"&&"body"in i){if(this.j=i.body.getReader(),this.o){if(this.responseType)throw Error('responseType must be empty for "streamBinaryChunks" mode responses.');this.response=[]}else this.response=this.responseText="",this.B=new TextDecoder;lo(this)}else i.text().then(this.Oa.bind(this),this.ga.bind(this))};function lo(i){i.j.read().then(i.Ma.bind(i)).catch(i.ga.bind(i))}n.Ma=function(i){if(this.g){if(this.o&&i.value)this.response.push(i.value);else if(!this.o){var l=i.value?i.value:new Uint8Array(0);(l=this.B.decode(l,{stream:!i.done}))&&(this.response=this.responseText+=l)}i.done?On(this):Ln(this),this.readyState==3&&lo(this)}},n.Oa=function(i){this.g&&(this.response=this.responseText=i,On(this))},n.Na=function(i){this.g&&(this.response=i,On(this))},n.ga=function(){this.g&&On(this)};function On(i){i.readyState=4,i.l=null,i.j=null,i.B=null,Ln(i)}n.setRequestHeader=function(i,l){this.A.append(i,l)},n.getResponseHeader=function(i){return this.h&&this.h.get(i.toLowerCase())||""},n.getAllResponseHeaders=function(){if(!this.h)return"";const i=[],l=this.h.entries();for(var u=l.next();!u.done;)u=u.value,i.push(u[0]+": "+u[1]),u=l.next();return i.join(`\r
`)};function Ln(i){i.onreadystatechange&&i.onreadystatechange.call(i)}Object.defineProperty(pr.prototype,"withCredentials",{get:function(){return this.m==="include"},set:function(i){this.m=i?"include":"same-origin"}});function co(i){let l="";return dt(i,function(u,f){l+=f,l+=":",l+=u,l+=`\r
`}),l}function gs(i,l,u){e:{for(f in u){var f=!1;break e}f=!0}f||(u=co(u),typeof i=="string"?u!=null&&xn(u):ue(i,l,u))}function Te(i){B.call(this),this.headers=new Map,this.L=i||null,this.h=!1,this.g=null,this.D="",this.o=0,this.l="",this.j=this.B=this.v=this.A=!1,this.m=null,this.F="",this.H=!1}m(Te,B);var Gc=/^https?$/i,Hc=["POST","PUT"];n=Te.prototype,n.Fa=function(i){this.H=i},n.ea=function(i,l,u,f){if(this.g)throw Error("[goog.net.XhrIo] Object is active with another request="+this.D+"; newUri="+i);l=l?l.toUpperCase():"GET",this.D=i,this.l="",this.o=0,this.A=!1,this.h=!0,this.g=this.L?this.L.g():qi.g(),this.g.onreadystatechange=I(d(this.Ca,this));try{this.B=!0,this.g.open(l,String(i),!0),this.B=!1}catch(S){uo(this,S);return}if(i=u||"",u=new Map(this.headers),f)if(Object.getPrototypeOf(f)===Object.prototype)for(var A in f)u.set(A,f[A]);else if(typeof f.keys=="function"&&typeof f.get=="function")for(const S of f.keys())u.set(S,f.get(S));else throw Error("Unknown input type for opt_headers: "+String(f));f=Array.from(u.keys()).find(S=>S.toLowerCase()=="content-type"),A=a.FormData&&i instanceof a.FormData,!(Array.prototype.indexOf.call(Hc,l,void 0)>=0)||f||A||u.set("Content-Type","application/x-www-form-urlencoded;charset=utf-8");for(const[S,N]of u)this.g.setRequestHeader(S,N);this.F&&(this.g.responseType=this.F),"withCredentials"in this.g&&this.g.withCredentials!==this.H&&(this.g.withCredentials=this.H);try{this.m&&(clearTimeout(this.m),this.m=null),this.v=!0,this.g.send(i),this.v=!1}catch(S){uo(this,S)}};function uo(i,l){i.h=!1,i.g&&(i.j=!0,i.g.abort(),i.j=!1),i.l=l,i.o=5,ho(i),mr(i)}function ho(i){i.A||(i.A=!0,K(i,"complete"),K(i,"error"))}n.abort=function(i){this.g&&this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1,this.o=i||7,K(this,"complete"),K(this,"abort"),mr(this))},n.N=function(){this.g&&(this.h&&(this.h=!1,this.j=!0,this.g.abort(),this.j=!1),mr(this,!0)),Te.Z.N.call(this)},n.Ca=function(){this.u||(this.B||this.v||this.j?fo(this):this.Xa())},n.Xa=function(){fo(this)};function fo(i){if(i.h&&typeof o<"u"){if(i.v&&yt(i)==4)setTimeout(i.Ca.bind(i),0);else if(K(i,"readystatechange"),yt(i)==4){i.h=!1;try{const S=i.ca();e:switch(S){case 200:case 201:case 202:case 204:case 206:case 304:case 1223:var l=!0;break e;default:l=!1}var u;if(!(u=l)){var f;if(f=S===0){let N=String(i.D).match(to)[1]||null;!N&&a.self&&a.self.location&&(N=a.self.location.protocol.slice(0,-1)),f=!Gc.test(N?N.toLowerCase():"")}u=f}if(u)K(i,"complete"),K(i,"success");else{i.o=6;try{var A=yt(i)>2?i.g.statusText:""}catch{A=""}i.l=A+" ["+i.ca()+"]",ho(i)}}finally{mr(i)}}}}function mr(i,l){if(i.g){i.m&&(clearTimeout(i.m),i.m=null);const u=i.g;i.g=null,l||K(i,"ready");try{u.onreadystatechange=null}catch{}}}n.isActive=function(){return!!this.g};function yt(i){return i.g?i.g.readyState:0}n.ca=function(){try{return yt(this)>2?this.g.status:-1}catch{return-1}},n.la=function(){try{return this.g?this.g.responseText:""}catch{return""}},n.La=function(i){if(this.g){var l=this.g.responseText;return i&&l.indexOf(i)==0&&(l=l.substring(i.length)),is(l)}};function po(i){try{if(!i.g)return null;if("response"in i.g)return i.g.response;switch(i.F){case"":case"text":return i.g.responseText;case"arraybuffer":if("mozResponseArrayBuffer"in i.g)return i.g.mozResponseArrayBuffer}return null}catch{return null}}function Kc(i){const l={};i=(i.g&&yt(i)>=2&&i.g.getAllResponseHeaders()||"").split(`\r
`);for(let f=0;f<i.length;f++){if(y(i[f]))continue;var u=Vc(i[f]);const A=u[0];if(u=u[1],typeof u!="string")continue;u=u.trim();const S=l[A]||[];l[A]=S,S.push(u)}In(l,function(f){return f.join(", ")})}n.ya=function(){return this.o},n.Ha=function(){return typeof this.l=="string"?this.l:String(this.l)};function Un(i,l,u){return u&&u.internalChannelParams&&u.internalChannelParams[i]||l}function mo(i){this.za=0,this.i=[],this.j=new Pn,this.ba=this.na=this.J=this.W=this.g=this.wa=this.G=this.H=this.u=this.U=this.o=null,this.Ya=this.V=0,this.Sa=Un("failFast",!1,i),this.F=this.C=this.v=this.m=this.l=null,this.X=!0,this.xa=this.K=-1,this.Y=this.A=this.D=0,this.Qa=Un("baseRetryDelayMs",5e3,i),this.Za=Un("retryDelaySeedMs",1e4,i),this.Ta=Un("forwardChannelMaxRetries",2,i),this.va=Un("forwardChannelRequestTimeoutMs",2e4,i),this.ma=i&&i.xmlHttpFactory||void 0,this.Ua=i&&i.Rb||void 0,this.Aa=i&&i.useFetchStreams||!1,this.O=void 0,this.L=i&&i.supportsCrossDomainXhr||!1,this.M="",this.h=new Yi(i&&i.concurrentRequestLimit),this.Ba=new qc,this.S=i&&i.fastHandshake||!1,this.R=i&&i.encodeInitMessageHeaders||!1,this.S&&this.R&&(this.R=!1),this.Ra=i&&i.Pb||!1,i&&i.ua&&this.j.ua(),i&&i.forceLongPolling&&(this.X=!1),this.aa=!this.S&&this.X&&i&&i.detectBufferingProxy||!1,this.ia=void 0,i&&i.longPollingTimeout&&i.longPollingTimeout>0&&(this.ia=i.longPollingTimeout),this.ta=void 0,this.T=0,this.P=!1,this.ja=this.B=null}n=mo.prototype,n.ka=8,n.I=1,n.connect=function(i,l,u,f){Ge(0),this.W=i,this.H=l||{},u&&f!==void 0&&(this.H.OSID=u,this.H.OAID=f),this.F=this.X,this.J=bo(this,null,this.W),yr(this)};function ys(i){if(go(i),i.I==3){var l=i.V++,u=nt(i.J);if(ue(u,"SID",i.M),ue(u,"RID",l),ue(u,"TYPE","terminate"),Bn(i,u),l=new pt(i,i.j,l),l.M=2,l.A=fr(nt(u)),u=!1,a.navigator&&a.navigator.sendBeacon)try{u=a.navigator.sendBeacon(l.A.toString(),"")}catch{}!u&&a.Image&&(new Image().src=l.A,u=!0),u||(l.g=Ao(l.j,null),l.g.ea(l.A)),l.F=Date.now(),dr(l)}Io(i)}function gr(i){i.g&&(Es(i),i.g.cancel(),i.g=null)}function go(i){gr(i),i.v&&(a.clearTimeout(i.v),i.v=null),_r(i),i.h.cancel(),i.m&&(typeof i.m=="number"&&a.clearTimeout(i.m),i.m=null)}function yr(i){if(!Xi(i.h)&&!i.m){i.m=!0;var l=i.Ea;Se||g(),me||(Se(),me=!0),w.add(l,i),i.D=0}}function Wc(i,l){return Ji(i.h)>=i.h.j-(i.m?1:0)?!1:i.m?(i.i=l.G.concat(i.i),!0):i.I==1||i.I==2||i.D>=(i.Sa?0:i.Ta)?!1:(i.m=Cn(d(i.Ea,i,l),wo(i,i.D)),i.D++,!0)}n.Ea=function(i){if(this.m)if(this.m=null,this.I==1){if(!i){this.V=Math.floor(Math.random()*1e5),i=this.V++;const A=new pt(this,this.j,i);let S=this.o;if(this.U&&(S?(S=Gt(S),C(S,this.U)):S=this.U),this.u!==null||this.R||(A.J=S,S=null),this.S)e:{for(var l=0,u=0;u<this.i.length;u++){t:{var f=this.i[u];if("__data__"in f.map&&(f=f.map.__data__,typeof f=="string")){f=f.length;break t}f=void 0}if(f===void 0)break;if(l+=f,l>4096){l=u;break e}if(l===4096||u===this.i.length-1){l=u+1;break e}}l=1e3}else l=1e3;l=_o(this,A,l),u=nt(this.J),ue(u,"RID",i),ue(u,"CVER",22),this.G&&ue(u,"X-HTTP-Session-Id",this.G),Bn(this,u),S&&(this.R?l="headers="+xn(co(S))+"&"+l:this.u&&gs(u,this.u,S)),fs(this.h,A),this.Ra&&ue(u,"TYPE","init"),this.S?(ue(u,"$req",l),ue(u,"SID","null"),A.U=!0,cs(A,u,null)):cs(A,u,l),this.I=2}}else this.I==3&&(i?yo(this,i):this.i.length==0||Xi(this.h)||yo(this))};function yo(i,l){var u;l?u=l.l:u=i.V++;const f=nt(i.J);ue(f,"SID",i.M),ue(f,"RID",u),ue(f,"AID",i.K),Bn(i,f),i.u&&i.o&&gs(f,i.u,i.o),u=new pt(i,i.j,u,i.D+1),i.u===null&&(u.J=i.o),l&&(i.i=l.G.concat(i.i)),l=_o(i,u,1e3),u.H=Math.round(i.va*.5)+Math.round(i.va*.5*Math.random()),fs(i.h,u),cs(u,f,l)}function Bn(i,l){i.H&&dt(i.H,function(u,f){ue(l,f,u)}),i.l&&dt({},function(u,f){ue(l,f,u)})}function _o(i,l,u){u=Math.min(i.i.length,u);const f=i.l?d(i.l.Ka,i.l,i):null;e:{var A=i.i;let Y=-1;for(;;){const Ve=["count="+u];Y==-1?u>0?(Y=A[0].g,Ve.push("ofs="+Y)):Y=0:Ve.push("ofs="+Y);let le=!0;for(let ke=0;ke<u;ke++){var S=A[ke].g;const rt=A[ke].map;if(S-=Y,S<0)Y=Math.max(0,A[ke].g-100),le=!1;else try{S="req"+S+"_"||"";try{var N=rt instanceof Map?rt:Object.entries(rt);for(const[Ot,_t]of N){let Et=_t;c(_t)&&(Et=Qt(_t)),Ve.push(S+Ot+"="+encodeURIComponent(Et))}}catch(Ot){throw Ve.push(S+"type="+encodeURIComponent("_badmap")),Ot}}catch{f&&f(rt)}}if(le){N=Ve.join("&");break e}}N=void 0}return i=i.i.splice(0,u),l.G=i,N}function Eo(i){if(!i.g&&!i.v){i.Y=1;var l=i.Da;Se||g(),me||(Se(),me=!0),w.add(l,i),i.A=0}}function _s(i){return i.g||i.v||i.A>=3?!1:(i.Y++,i.v=Cn(d(i.Da,i),wo(i,i.A)),i.A++,!0)}n.Da=function(){if(this.v=null,vo(this),this.aa&&!(this.P||this.g==null||this.T<=0)){var i=4*this.T;this.j.info("BP detection timer enabled: "+i),this.B=Cn(d(this.Wa,this),i)}},n.Wa=function(){this.B&&(this.B=null,this.j.info("BP detection timeout reached."),this.j.info("Buffering proxy detected and switch to long-polling!"),this.F=!1,this.P=!0,Ge(10),gr(this),vo(this))};function Es(i){i.B!=null&&(a.clearTimeout(i.B),i.B=null)}function vo(i){i.g=new pt(i,i.j,"rpc",i.Y),i.u===null&&(i.g.J=i.o),i.g.P=0;var l=nt(i.na);ue(l,"RID","rpc"),ue(l,"SID",i.M),ue(l,"AID",i.K),ue(l,"CI",i.F?"0":"1"),!i.F&&i.ia&&ue(l,"TO",i.ia),ue(l,"TYPE","xmlhttp"),Bn(i,l),i.u&&i.o&&gs(l,i.u,i.o),i.O&&(i.g.H=i.O);var u=i.g;i=i.ba,u.M=1,u.A=fr(nt(l)),u.u=null,u.R=!0,Ki(u,i)}n.Va=function(){this.C!=null&&(this.C=null,gr(this),_s(this),Ge(19))};function _r(i){i.C!=null&&(a.clearTimeout(i.C),i.C=null)}function To(i,l){var u=null;if(i.g==l){_r(i),Es(i),i.g=null;var f=2}else if(ds(i.h,l))u=l.G,Zi(i.h,l),f=1;else return;if(i.I!=0){if(l.o)if(f==1){u=l.u?l.u.length:0,l=Date.now()-l.F;var A=i.D;f=tt(),K(f,new zi(f,u)),yr(i)}else Eo(i);else if(A=l.m,A==3||A==0&&l.X>0||!(f==1&&Wc(i,l)||f==2&&_s(i)))switch(u&&u.length>0&&(l=i.h,l.i=l.i.concat(u)),A){case 1:Mt(i,5);break;case 4:Mt(i,10);break;case 3:Mt(i,6);break;default:Mt(i,2)}}}function wo(i,l){let u=i.Qa+Math.floor(Math.random()*i.Za);return i.isActive()||(u*=2),u*l}function Mt(i,l){if(i.j.info("Error code "+l),l==2){var u=d(i.bb,i),f=i.Ua;const A=!f;f=new mt(f||"//www.google.com/images/cleardot.gif"),a.location&&a.location.protocol=="http"||Dn(f,"https"),fr(f),A?zc(f.toString(),u):$c(f.toString(),u)}else Ge(2);i.I=0,i.l&&i.l.pa(l),Io(i),go(i)}n.bb=function(i){i?(this.j.info("Successfully pinged google.com"),Ge(2)):(this.j.info("Failed to ping google.com"),Ge(1))};function Io(i){if(i.I=0,i.ja=[],i.l){const l=eo(i.h);(l.length!=0||i.i.length!=0)&&(L(i.ja,l),L(i.ja,i.i),i.h.i.length=0,R(i.i),i.i.length=0),i.l.oa()}}function bo(i,l,u){var f=u instanceof mt?nt(u):new mt(u);if(f.g!="")l&&(f.g=l+"."+f.g),kn(f,f.u);else{var A=a.location;f=A.protocol,l=l?l+"."+A.hostname:A.hostname,A=+A.port;const S=new mt(null);f&&Dn(S,f),l&&(S.g=l),A&&kn(S,A),u&&(S.h=u),f=S}return u=i.G,l=i.wa,u&&l&&ue(f,u,l),ue(f,"VER",i.ka),Bn(i,f),f}function Ao(i,l,u){if(l&&!i.L)throw Error("Can't create secondary domain capable XhrIo object.");return l=i.Aa&&!i.ma?new Te(new ms({ab:u})):new Te(i.ma),l.Fa(i.L),l}n.isActive=function(){return!!this.l&&this.l.isActive(this)};function So(){}n=So.prototype,n.ra=function(){},n.qa=function(){},n.pa=function(){},n.oa=function(){},n.isActive=function(){return!0},n.Ka=function(){};function Er(){}Er.prototype.g=function(i,l){return new We(i,l)};function We(i,l){B.call(this),this.g=new mo(l),this.l=i,this.h=l&&l.messageUrlParams||null,i=l&&l.messageHeaders||null,l&&l.clientProtocolHeaderRequired&&(i?i["X-Client-Protocol"]="webchannel":i={"X-Client-Protocol":"webchannel"}),this.g.o=i,i=l&&l.initMessageHeaders||null,l&&l.messageContentType&&(i?i["X-WebChannel-Content-Type"]=l.messageContentType:i={"X-WebChannel-Content-Type":l.messageContentType}),l&&l.sa&&(i?i["X-WebChannel-Client-Profile"]=l.sa:i={"X-WebChannel-Client-Profile":l.sa}),this.g.U=i,(i=l&&l.Qb)&&!y(i)&&(this.g.u=i),this.A=l&&l.supportsCrossDomainXhr||!1,this.v=l&&l.sendRawJson||!1,(l=l&&l.httpSessionIdParam)&&!y(l)&&(this.g.G=l,i=this.h,i!==null&&l in i&&(i=this.h,l in i&&delete i[l])),this.j=new Jt(this)}m(We,B),We.prototype.m=function(){this.g.l=this.j,this.A&&(this.g.L=!0),this.g.connect(this.l,this.h||void 0)},We.prototype.close=function(){ys(this.g)},We.prototype.o=function(i){var l=this.g;if(typeof i=="string"){var u={};u.__data__=i,i=u}else this.v&&(u={},u.__data__=Qt(i),i=u);l.i.push(new Nc(l.Ya++,i)),l.I==3&&yr(l)},We.prototype.N=function(){this.g.l=null,delete this.j,ys(this.g),delete this.g,We.Z.N.call(this)};function Ro(i){V.call(this),i.__headers__&&(this.headers=i.__headers__,this.statusCode=i.__status__,delete i.__headers__,delete i.__status__);var l=i.__sm__;if(l){e:{for(const u in l){i=u;break e}i=void 0}(this.i=i)&&(i=this.i,l=l!==null&&i in l?l[i]:void 0),this.data=l}else this.data=i}m(Ro,V);function Co(){W.call(this),this.status=1}m(Co,W);function Jt(i){this.g=i}m(Jt,So),Jt.prototype.ra=function(){K(this.g,"a")},Jt.prototype.qa=function(i){K(this.g,new Ro(i))},Jt.prototype.pa=function(i){K(this.g,new Co)},Jt.prototype.oa=function(){K(this.g,"b")},Er.prototype.createWebChannel=Er.prototype.g,We.prototype.send=We.prototype.o,We.prototype.open=We.prototype.m,We.prototype.close=We.prototype.close,hl=function(){return new Er},ul=function(){return tt()},cl=ye,Bs={jb:0,mb:1,nb:2,Hb:3,Mb:4,Jb:5,Kb:6,Ib:7,Gb:8,Lb:9,PROXY:10,NOPROXY:11,Eb:12,Ab:13,Bb:14,zb:15,Cb:16,Db:17,fb:18,eb:19,gb:20},hr.NO_ERROR=0,hr.TIMEOUT=8,hr.HTTP_ERROR=6,Cr=hr,$i.COMPLETE="complete",ll=$i,ur.EventType=ft,ft.OPEN="a",ft.CLOSE="b",ft.ERROR="c",ft.MESSAGE="d",B.prototype.listen=B.prototype.J,zn=ur,Te.prototype.listenOnce=Te.prototype.K,Te.prototype.getLastError=Te.prototype.Ha,Te.prototype.getLastErrorCode=Te.prototype.ya,Te.prototype.getStatus=Te.prototype.ca,Te.prototype.getResponseJson=Te.prototype.La,Te.prototype.getResponseText=Te.prototype.la,Te.prototype.send=Te.prototype.ea,Te.prototype.setWithCredentials=Te.prototype.Fa,al=Te}).apply(typeof wr<"u"?wr:typeof self<"u"?self:typeof window<"u"?window:{});const Ko="@firebase/firestore",Wo="4.9.2";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Be{constructor(e){this.uid=e}isAuthenticated(){return this.uid!=null}toKey(){return this.isAuthenticated()?"uid:"+this.uid:"anonymous-user"}isEqual(e){return e.uid===this.uid}}Be.UNAUTHENTICATED=new Be(null),Be.GOOGLE_CREDENTIALS=new Be("google-credentials-uid"),Be.FIRST_PARTY=new Be("first-party-uid"),Be.MOCK_USER=new Be("mock-user");/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let _n="12.3.0";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const zt=new el("@firebase/firestore");function Zt(){return zt.logLevel}function U(n,...e){if(zt.logLevel<=te.DEBUG){const t=e.map(hi);zt.debug(`Firestore (${_n}): ${n}`,...t)}}function ht(n,...e){if(zt.logLevel<=te.ERROR){const t=e.map(hi);zt.error(`Firestore (${_n}): ${n}`,...t)}}function un(n,...e){if(zt.logLevel<=te.WARN){const t=e.map(hi);zt.warn(`Firestore (${_n}): ${n}`,...t)}}function hi(n){if(typeof n=="string")return n;try{/**
* @license
* Copyright 2020 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/return(function(t){return JSON.stringify(t)})(n)}catch{return n}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function H(n,e,t){let r="Unexpected state";typeof e=="string"?r=e:t=e,dl(n,r,t)}function dl(n,e,t){let r=`FIRESTORE (${_n}) INTERNAL ASSERTION FAILED: ${e} (ID: ${n.toString(16)})`;if(t!==void 0)try{r+=" CONTEXT: "+JSON.stringify(t)}catch{r+=" CONTEXT: "+t}throw ht(r),new Error(r)}function Ee(n,e,t,r){let s="Unexpected state";typeof t=="string"?s=t:r=t,n||dl(e,s,r)}function ne(n,e){return n}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const D={OK:"ok",CANCELLED:"cancelled",UNKNOWN:"unknown",INVALID_ARGUMENT:"invalid-argument",DEADLINE_EXCEEDED:"deadline-exceeded",NOT_FOUND:"not-found",ALREADY_EXISTS:"already-exists",PERMISSION_DENIED:"permission-denied",UNAUTHENTICATED:"unauthenticated",RESOURCE_EXHAUSTED:"resource-exhausted",FAILED_PRECONDITION:"failed-precondition",ABORTED:"aborted",OUT_OF_RANGE:"out-of-range",UNIMPLEMENTED:"unimplemented",INTERNAL:"internal",UNAVAILABLE:"unavailable",DATA_LOSS:"data-loss"};class j extends yn{constructor(e,t){super(e,t),this.code=e,this.message=t,this.toString=()=>`${this.name}: [code=${this.code}]: ${this.message}`}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class sn{constructor(){this.promise=new Promise(((e,t)=>{this.resolve=e,this.reject=t}))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class fl{constructor(e,t){this.user=t,this.type="OAuth",this.headers=new Map,this.headers.set("Authorization",`Bearer ${e}`)}}class zh{getToken(){return Promise.resolve(null)}invalidateToken(){}start(e,t){e.enqueueRetryable((()=>t(Be.UNAUTHENTICATED)))}shutdown(){}}class $h{constructor(e){this.token=e,this.changeListener=null}getToken(){return Promise.resolve(this.token)}invalidateToken(){}start(e,t){this.changeListener=t,e.enqueueRetryable((()=>t(this.token.user)))}shutdown(){this.changeListener=null}}class qh{constructor(e){this.t=e,this.currentUser=Be.UNAUTHENTICATED,this.i=0,this.forceRefresh=!1,this.auth=null}start(e,t){Ee(this.o===void 0,42304);let r=this.i;const s=h=>this.i!==r?(r=this.i,t(h)):Promise.resolve();let o=new sn;this.o=()=>{this.i++,this.currentUser=this.u(),o.resolve(),o=new sn,e.enqueueRetryable((()=>s(this.currentUser)))};const a=()=>{const h=o;e.enqueueRetryable((async()=>{await h.promise,await s(this.currentUser)}))},c=h=>{U("FirebaseAuthCredentialsProvider","Auth detected"),this.auth=h,this.o&&(this.auth.addAuthTokenListener(this.o),a())};this.t.onInit((h=>c(h))),setTimeout((()=>{if(!this.auth){const h=this.t.getImmediate({optional:!0});h?c(h):(U("FirebaseAuthCredentialsProvider","Auth not yet detected"),o.resolve(),o=new sn)}}),0),a()}getToken(){const e=this.i,t=this.forceRefresh;return this.forceRefresh=!1,this.auth?this.auth.getToken(t).then((r=>this.i!==e?(U("FirebaseAuthCredentialsProvider","getToken aborted due to token change."),this.getToken()):r?(Ee(typeof r.accessToken=="string",31837,{l:r}),new fl(r.accessToken,this.currentUser)):null)):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.auth&&this.o&&this.auth.removeAuthTokenListener(this.o),this.o=void 0}u(){const e=this.auth&&this.auth.getUid();return Ee(e===null||typeof e=="string",2055,{h:e}),new Be(e)}}class Gh{constructor(e,t,r){this.P=e,this.T=t,this.I=r,this.type="FirstParty",this.user=Be.FIRST_PARTY,this.A=new Map}R(){return this.I?this.I():null}get headers(){this.A.set("X-Goog-AuthUser",this.P);const e=this.R();return e&&this.A.set("Authorization",e),this.T&&this.A.set("X-Goog-Iam-Authorization-Token",this.T),this.A}}class Hh{constructor(e,t,r){this.P=e,this.T=t,this.I=r}getToken(){return Promise.resolve(new Gh(this.P,this.T,this.I))}start(e,t){e.enqueueRetryable((()=>t(Be.FIRST_PARTY)))}shutdown(){}invalidateToken(){}}class Qo{constructor(e){this.value=e,this.type="AppCheck",this.headers=new Map,e&&e.length>0&&this.headers.set("x-firebase-appcheck",this.value)}}class Kh{constructor(e,t){this.V=t,this.forceRefresh=!1,this.appCheck=null,this.m=null,this.p=null,Ah(e)&&e.settings.appCheckToken&&(this.p=e.settings.appCheckToken)}start(e,t){Ee(this.o===void 0,3512);const r=o=>{o.error!=null&&U("FirebaseAppCheckTokenProvider",`Error getting App Check token; using placeholder token instead. Error: ${o.error.message}`);const a=o.token!==this.m;return this.m=o.token,U("FirebaseAppCheckTokenProvider",`Received ${a?"new":"existing"} token.`),a?t(o.token):Promise.resolve()};this.o=o=>{e.enqueueRetryable((()=>r(o)))};const s=o=>{U("FirebaseAppCheckTokenProvider","AppCheck detected"),this.appCheck=o,this.o&&this.appCheck.addTokenListener(this.o)};this.V.onInit((o=>s(o))),setTimeout((()=>{if(!this.appCheck){const o=this.V.getImmediate({optional:!0});o?s(o):U("FirebaseAppCheckTokenProvider","AppCheck not yet detected")}}),0)}getToken(){if(this.p)return Promise.resolve(new Qo(this.p));const e=this.forceRefresh;return this.forceRefresh=!1,this.appCheck?this.appCheck.getToken(e).then((t=>t?(Ee(typeof t.token=="string",44558,{tokenResult:t}),this.m=t.token,new Qo(t.token)):null)):Promise.resolve(null)}invalidateToken(){this.forceRefresh=!0}shutdown(){this.appCheck&&this.o&&this.appCheck.removeTokenListener(this.o),this.o=void 0}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Wh(n){const e=typeof self<"u"&&(self.crypto||self.msCrypto),t=new Uint8Array(n);if(e&&typeof e.getRandomValues=="function")e.getRandomValues(t);else for(let r=0;r<n;r++)t[r]=Math.floor(256*Math.random());return t}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class pl{static newId(){const e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",t=62*Math.floor(4.129032258064516);let r="";for(;r.length<20;){const s=Wh(40);for(let o=0;o<s.length;++o)r.length<20&&s[o]<t&&(r+=e.charAt(s[o]%62))}return r}}function Z(n,e){return n<e?-1:n>e?1:0}function js(n,e){const t=Math.min(n.length,e.length);for(let r=0;r<t;r++){const s=n.charAt(r),o=e.charAt(r);if(s!==o)return Rs(s)===Rs(o)?Z(s,o):Rs(s)?1:-1}return Z(n.length,e.length)}const Qh=55296,Yh=57343;function Rs(n){const e=n.charCodeAt(0);return e>=Qh&&e<=Yh}function hn(n,e,t){return n.length===e.length&&n.every(((r,s)=>t(r,e[s])))}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Yo="__name__";class st{constructor(e,t,r){t===void 0?t=0:t>e.length&&H(637,{offset:t,range:e.length}),r===void 0?r=e.length-t:r>e.length-t&&H(1746,{length:r,range:e.length-t}),this.segments=e,this.offset=t,this.len=r}get length(){return this.len}isEqual(e){return st.comparator(this,e)===0}child(e){const t=this.segments.slice(this.offset,this.limit());return e instanceof st?e.forEach((r=>{t.push(r)})):t.push(e),this.construct(t)}limit(){return this.offset+this.length}popFirst(e){return e=e===void 0?1:e,this.construct(this.segments,this.offset+e,this.length-e)}popLast(){return this.construct(this.segments,this.offset,this.length-1)}firstSegment(){return this.segments[this.offset]}lastSegment(){return this.get(this.length-1)}get(e){return this.segments[this.offset+e]}isEmpty(){return this.length===0}isPrefixOf(e){if(e.length<this.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}isImmediateParentOf(e){if(this.length+1!==e.length)return!1;for(let t=0;t<this.length;t++)if(this.get(t)!==e.get(t))return!1;return!0}forEach(e){for(let t=this.offset,r=this.limit();t<r;t++)e(this.segments[t])}toArray(){return this.segments.slice(this.offset,this.limit())}static comparator(e,t){const r=Math.min(e.length,t.length);for(let s=0;s<r;s++){const o=st.compareSegments(e.get(s),t.get(s));if(o!==0)return o}return Z(e.length,t.length)}static compareSegments(e,t){const r=st.isNumericId(e),s=st.isNumericId(t);return r&&!s?-1:!r&&s?1:r&&s?st.extractNumericId(e).compare(st.extractNumericId(t)):js(e,t)}static isNumericId(e){return e.startsWith("__id")&&e.endsWith("__")}static extractNumericId(e){return bt.fromString(e.substring(4,e.length-2))}}class fe extends st{construct(e,t,r){return new fe(e,t,r)}canonicalString(){return this.toArray().join("/")}toString(){return this.canonicalString()}toUriEncodedString(){return this.toArray().map(encodeURIComponent).join("/")}static fromString(...e){const t=[];for(const r of e){if(r.indexOf("//")>=0)throw new j(D.INVALID_ARGUMENT,`Invalid segment (${r}). Paths must not contain // in them.`);t.push(...r.split("/").filter((s=>s.length>0)))}return new fe(t)}static emptyPath(){return new fe([])}}const Xh=/^[_a-zA-Z][_a-zA-Z0-9]*$/;class ze extends st{construct(e,t,r){return new ze(e,t,r)}static isValidIdentifier(e){return Xh.test(e)}canonicalString(){return this.toArray().map((e=>(e=e.replace(/\\/g,"\\\\").replace(/`/g,"\\`"),ze.isValidIdentifier(e)||(e="`"+e+"`"),e))).join(".")}toString(){return this.canonicalString()}isKeyField(){return this.length===1&&this.get(0)===Yo}static keyField(){return new ze([Yo])}static fromServerFormat(e){const t=[];let r="",s=0;const o=()=>{if(r.length===0)throw new j(D.INVALID_ARGUMENT,`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`);t.push(r),r=""};let a=!1;for(;s<e.length;){const c=e[s];if(c==="\\"){if(s+1===e.length)throw new j(D.INVALID_ARGUMENT,"Path has trailing escape character: "+e);const h=e[s+1];if(h!=="\\"&&h!=="."&&h!=="`")throw new j(D.INVALID_ARGUMENT,"Path has invalid escape sequence: "+e);r+=h,s+=2}else c==="`"?(a=!a,s++):c!=="."||a?(r+=c,s++):(o(),s++)}if(o(),a)throw new j(D.INVALID_ARGUMENT,"Unterminated ` in path: "+e);return new ze(t)}static emptyPath(){return new ze([])}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class q{constructor(e){this.path=e}static fromPath(e){return new q(fe.fromString(e))}static fromName(e){return new q(fe.fromString(e).popFirst(5))}static empty(){return new q(fe.emptyPath())}get collectionGroup(){return this.path.popLast().lastSegment()}hasCollectionId(e){return this.path.length>=2&&this.path.get(this.path.length-2)===e}getCollectionGroup(){return this.path.get(this.path.length-2)}getCollectionPath(){return this.path.popLast()}isEqual(e){return e!==null&&fe.comparator(this.path,e.path)===0}toString(){return this.path.toString()}static comparator(e,t){return fe.comparator(e.path,t.path)}static isDocumentKey(e){return e.length%2==0}static fromSegments(e){return new q(new fe(e.slice()))}}function Jh(n,e,t,r){if(e===!0&&r===!0)throw new j(D.INVALID_ARGUMENT,`${n} and ${t} cannot be used together.`)}function Xo(n){if(q.isDocumentKey(n))throw new j(D.INVALID_ARGUMENT,`Invalid collection reference. Collection references must have an odd number of segments, but ${n} has ${n.length}.`)}function ml(n){return typeof n=="object"&&n!==null&&(Object.getPrototypeOf(n)===Object.prototype||Object.getPrototypeOf(n)===null)}function Kr(n){if(n===void 0)return"undefined";if(n===null)return"null";if(typeof n=="string")return n.length>20&&(n=`${n.substring(0,20)}...`),JSON.stringify(n);if(typeof n=="number"||typeof n=="boolean")return""+n;if(typeof n=="object"){if(n instanceof Array)return"an array";{const e=(function(r){return r.constructor?r.constructor.name:null})(n);return e?`a custom ${e} object`:"an object"}}return typeof n=="function"?"a function":H(12329,{type:typeof n})}function Pr(n,e){if("_delegate"in n&&(n=n._delegate),!(n instanceof e)){if(e.name===n.constructor.name)throw new j(D.INVALID_ARGUMENT,"Type does not match the expected instance. Did you pass a reference from a different Firestore SDK?");{const t=Kr(n);throw new j(D.INVALID_ARGUMENT,`Expected type '${e.name}', but it was: ${t}`)}}return n}/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Pe(n,e){const t={typeString:n};return e&&(t.value=e),t}function ir(n,e){if(!ml(n))throw new j(D.INVALID_ARGUMENT,"JSON must be an object");let t;for(const r in e)if(e[r]){const s=e[r].typeString,o="value"in e[r]?{value:e[r].value}:void 0;if(!(r in n)){t=`JSON missing required field: '${r}'`;break}const a=n[r];if(s&&typeof a!==s){t=`JSON field '${r}' must be a ${s}.`;break}if(o!==void 0&&a!==o.value){t=`Expected '${r}' field to equal '${o.value}'`;break}}if(t)throw new j(D.INVALID_ARGUMENT,t);return!0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Jo=-62135596800,Zo=1e6;class pe{static now(){return pe.fromMillis(Date.now())}static fromDate(e){return pe.fromMillis(e.getTime())}static fromMillis(e){const t=Math.floor(e/1e3),r=Math.floor((e-1e3*t)*Zo);return new pe(t,r)}constructor(e,t){if(this.seconds=e,this.nanoseconds=t,t<0)throw new j(D.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(t>=1e9)throw new j(D.INVALID_ARGUMENT,"Timestamp nanoseconds out of range: "+t);if(e<Jo)throw new j(D.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e);if(e>=253402300800)throw new j(D.INVALID_ARGUMENT,"Timestamp seconds out of range: "+e)}toDate(){return new Date(this.toMillis())}toMillis(){return 1e3*this.seconds+this.nanoseconds/Zo}_compareTo(e){return this.seconds===e.seconds?Z(this.nanoseconds,e.nanoseconds):Z(this.seconds,e.seconds)}isEqual(e){return e.seconds===this.seconds&&e.nanoseconds===this.nanoseconds}toString(){return"Timestamp(seconds="+this.seconds+", nanoseconds="+this.nanoseconds+")"}toJSON(){return{type:pe._jsonSchemaVersion,seconds:this.seconds,nanoseconds:this.nanoseconds}}static fromJSON(e){if(ir(e,pe._jsonSchema))return new pe(e.seconds,e.nanoseconds)}valueOf(){const e=this.seconds-Jo;return String(e).padStart(12,"0")+"."+String(this.nanoseconds).padStart(9,"0")}}pe._jsonSchemaVersion="firestore/timestamp/1.0",pe._jsonSchema={type:Pe("string",pe._jsonSchemaVersion),seconds:Pe("number"),nanoseconds:Pe("number")};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class G{static fromTimestamp(e){return new G(e)}static min(){return new G(new pe(0,0))}static max(){return new G(new pe(253402300799,999999999))}constructor(e){this.timestamp=e}compareTo(e){return this.timestamp._compareTo(e.timestamp)}isEqual(e){return this.timestamp.isEqual(e.timestamp)}toMicroseconds(){return 1e6*this.timestamp.seconds+this.timestamp.nanoseconds/1e3}toString(){return"SnapshotVersion("+this.timestamp.toString()+")"}toTimestamp(){return this.timestamp}}/**
 * @license
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const er=-1;function Zh(n,e){const t=n.toTimestamp().seconds,r=n.toTimestamp().nanoseconds+1,s=G.fromTimestamp(r===1e9?new pe(t+1,0):new pe(t,r));return new At(s,q.empty(),e)}function ed(n){return new At(n.readTime,n.key,er)}class At{constructor(e,t,r){this.readTime=e,this.documentKey=t,this.largestBatchId=r}static min(){return new At(G.min(),q.empty(),er)}static max(){return new At(G.max(),q.empty(),er)}}function td(n,e){let t=n.readTime.compareTo(e.readTime);return t!==0?t:(t=q.comparator(n.documentKey,e.documentKey),t!==0?t:Z(n.largestBatchId,e.largestBatchId))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const nd="The current tab is not in the required state to perform this operation. It might be necessary to refresh the browser tab.";class rd{constructor(){this.onCommittedListeners=[]}addOnCommittedListener(e){this.onCommittedListeners.push(e)}raiseOnCommittedEvent(){this.onCommittedListeners.forEach((e=>e()))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Wr(n){if(n.code!==D.FAILED_PRECONDITION||n.message!==nd)throw n;U("LocalStore","Unexpectedly lost primary lease")}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class P{constructor(e){this.nextCallback=null,this.catchCallback=null,this.result=void 0,this.error=void 0,this.isDone=!1,this.callbackAttached=!1,e((t=>{this.isDone=!0,this.result=t,this.nextCallback&&this.nextCallback(t)}),(t=>{this.isDone=!0,this.error=t,this.catchCallback&&this.catchCallback(t)}))}catch(e){return this.next(void 0,e)}next(e,t){return this.callbackAttached&&H(59440),this.callbackAttached=!0,this.isDone?this.error?this.wrapFailure(t,this.error):this.wrapSuccess(e,this.result):new P(((r,s)=>{this.nextCallback=o=>{this.wrapSuccess(e,o).next(r,s)},this.catchCallback=o=>{this.wrapFailure(t,o).next(r,s)}}))}toPromise(){return new Promise(((e,t)=>{this.next(e,t)}))}wrapUserFunction(e){try{const t=e();return t instanceof P?t:P.resolve(t)}catch(t){return P.reject(t)}}wrapSuccess(e,t){return e?this.wrapUserFunction((()=>e(t))):P.resolve(t)}wrapFailure(e,t){return e?this.wrapUserFunction((()=>e(t))):P.reject(t)}static resolve(e){return new P(((t,r)=>{t(e)}))}static reject(e){return new P(((t,r)=>{r(e)}))}static waitFor(e){return new P(((t,r)=>{let s=0,o=0,a=!1;e.forEach((c=>{++s,c.next((()=>{++o,a&&o===s&&t()}),(h=>r(h)))})),a=!0,o===s&&t()}))}static or(e){let t=P.resolve(!1);for(const r of e)t=t.next((s=>s?P.resolve(s):r()));return t}static forEach(e,t){const r=[];return e.forEach(((s,o)=>{r.push(t.call(this,s,o))})),this.waitFor(r)}static mapArray(e,t){return new P(((r,s)=>{const o=e.length,a=new Array(o);let c=0;for(let h=0;h<o;h++){const d=h;t(e[d]).next((p=>{a[d]=p,++c,c===o&&r(a)}),(p=>s(p)))}}))}static doWhile(e,t){return new P(((r,s)=>{const o=()=>{e()===!0?t().next((()=>{o()}),s):r()};o()}))}}function sd(n){const e=n.match(/Android ([\d.]+)/i),t=e?e[1].split(".").slice(0,2).join("."):"-1";return Number(t)}function En(n){return n.name==="IndexedDbTransactionError"}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Qr{constructor(e,t){this.previousValue=e,t&&(t.sequenceNumberHandler=r=>this.ae(r),this.ue=r=>t.writeSequenceNumber(r))}ae(e){return this.previousValue=Math.max(e,this.previousValue),this.previousValue}next(){const e=++this.previousValue;return this.ue&&this.ue(e),e}}Qr.ce=-1;/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const id=-1;function Yr(n){return n==null}function Lr(n){return n===0&&1/n==-1/0}function od(n){return typeof n=="number"&&Number.isInteger(n)&&!Lr(n)&&n<=Number.MAX_SAFE_INTEGER&&n>=Number.MIN_SAFE_INTEGER}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const gl="";function ad(n){let e="";for(let t=0;t<n.length;t++)e.length>0&&(e=ea(e)),e=ld(n.get(t),e);return ea(e)}function ld(n,e){let t=e;const r=n.length;for(let s=0;s<r;s++){const o=n.charAt(s);switch(o){case"\0":t+="";break;case gl:t+="";break;default:t+=o}}return t}function ea(n){return n+gl+""}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ta(n){let e=0;for(const t in n)Object.prototype.hasOwnProperty.call(n,t)&&e++;return e}function vn(n,e){for(const t in n)Object.prototype.hasOwnProperty.call(n,t)&&e(t,n[t])}function yl(n){for(const e in n)if(Object.prototype.hasOwnProperty.call(n,e))return!1;return!0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ae{constructor(e,t){this.comparator=e,this.root=t||Me.EMPTY}insert(e,t){return new Ae(this.comparator,this.root.insert(e,t,this.comparator).copy(null,null,Me.BLACK,null,null))}remove(e){return new Ae(this.comparator,this.root.remove(e,this.comparator).copy(null,null,Me.BLACK,null,null))}get(e){let t=this.root;for(;!t.isEmpty();){const r=this.comparator(e,t.key);if(r===0)return t.value;r<0?t=t.left:r>0&&(t=t.right)}return null}indexOf(e){let t=0,r=this.root;for(;!r.isEmpty();){const s=this.comparator(e,r.key);if(s===0)return t+r.left.size;s<0?r=r.left:(t+=r.left.size+1,r=r.right)}return-1}isEmpty(){return this.root.isEmpty()}get size(){return this.root.size}minKey(){return this.root.minKey()}maxKey(){return this.root.maxKey()}inorderTraversal(e){return this.root.inorderTraversal(e)}forEach(e){this.inorderTraversal(((t,r)=>(e(t,r),!1)))}toString(){const e=[];return this.inorderTraversal(((t,r)=>(e.push(`${t}:${r}`),!1))),`{${e.join(", ")}}`}reverseTraversal(e){return this.root.reverseTraversal(e)}getIterator(){return new Ir(this.root,null,this.comparator,!1)}getIteratorFrom(e){return new Ir(this.root,e,this.comparator,!1)}getReverseIterator(){return new Ir(this.root,null,this.comparator,!0)}getReverseIteratorFrom(e){return new Ir(this.root,e,this.comparator,!0)}}class Ir{constructor(e,t,r,s){this.isReverse=s,this.nodeStack=[];let o=1;for(;!e.isEmpty();)if(o=t?r(e.key,t):1,t&&s&&(o*=-1),o<0)e=this.isReverse?e.left:e.right;else{if(o===0){this.nodeStack.push(e);break}this.nodeStack.push(e),e=this.isReverse?e.right:e.left}}getNext(){let e=this.nodeStack.pop();const t={key:e.key,value:e.value};if(this.isReverse)for(e=e.left;!e.isEmpty();)this.nodeStack.push(e),e=e.right;else for(e=e.right;!e.isEmpty();)this.nodeStack.push(e),e=e.left;return t}hasNext(){return this.nodeStack.length>0}peek(){if(this.nodeStack.length===0)return null;const e=this.nodeStack[this.nodeStack.length-1];return{key:e.key,value:e.value}}}class Me{constructor(e,t,r,s,o){this.key=e,this.value=t,this.color=r??Me.RED,this.left=s??Me.EMPTY,this.right=o??Me.EMPTY,this.size=this.left.size+1+this.right.size}copy(e,t,r,s,o){return new Me(e??this.key,t??this.value,r??this.color,s??this.left,o??this.right)}isEmpty(){return!1}inorderTraversal(e){return this.left.inorderTraversal(e)||e(this.key,this.value)||this.right.inorderTraversal(e)}reverseTraversal(e){return this.right.reverseTraversal(e)||e(this.key,this.value)||this.left.reverseTraversal(e)}min(){return this.left.isEmpty()?this:this.left.min()}minKey(){return this.min().key}maxKey(){return this.right.isEmpty()?this.key:this.right.maxKey()}insert(e,t,r){let s=this;const o=r(e,s.key);return s=o<0?s.copy(null,null,null,s.left.insert(e,t,r),null):o===0?s.copy(null,t,null,null,null):s.copy(null,null,null,null,s.right.insert(e,t,r)),s.fixUp()}removeMin(){if(this.left.isEmpty())return Me.EMPTY;let e=this;return e.left.isRed()||e.left.left.isRed()||(e=e.moveRedLeft()),e=e.copy(null,null,null,e.left.removeMin(),null),e.fixUp()}remove(e,t){let r,s=this;if(t(e,s.key)<0)s.left.isEmpty()||s.left.isRed()||s.left.left.isRed()||(s=s.moveRedLeft()),s=s.copy(null,null,null,s.left.remove(e,t),null);else{if(s.left.isRed()&&(s=s.rotateRight()),s.right.isEmpty()||s.right.isRed()||s.right.left.isRed()||(s=s.moveRedRight()),t(e,s.key)===0){if(s.right.isEmpty())return Me.EMPTY;r=s.right.min(),s=s.copy(r.key,r.value,null,null,s.right.removeMin())}s=s.copy(null,null,null,null,s.right.remove(e,t))}return s.fixUp()}isRed(){return this.color}fixUp(){let e=this;return e.right.isRed()&&!e.left.isRed()&&(e=e.rotateLeft()),e.left.isRed()&&e.left.left.isRed()&&(e=e.rotateRight()),e.left.isRed()&&e.right.isRed()&&(e=e.colorFlip()),e}moveRedLeft(){let e=this.colorFlip();return e.right.left.isRed()&&(e=e.copy(null,null,null,null,e.right.rotateRight()),e=e.rotateLeft(),e=e.colorFlip()),e}moveRedRight(){let e=this.colorFlip();return e.left.left.isRed()&&(e=e.rotateRight(),e=e.colorFlip()),e}rotateLeft(){const e=this.copy(null,null,Me.RED,null,this.right.left);return this.right.copy(null,null,this.color,e,null)}rotateRight(){const e=this.copy(null,null,Me.RED,this.left.right,null);return this.left.copy(null,null,this.color,null,e)}colorFlip(){const e=this.left.copy(null,null,!this.left.color,null,null),t=this.right.copy(null,null,!this.right.color,null,null);return this.copy(null,null,!this.color,e,t)}checkMaxDepth(){const e=this.check();return Math.pow(2,e)<=this.size+1}check(){if(this.isRed()&&this.left.isRed())throw H(43730,{key:this.key,value:this.value});if(this.right.isRed())throw H(14113,{key:this.key,value:this.value});const e=this.left.check();if(e!==this.right.check())throw H(27949);return e+(this.isRed()?0:1)}}Me.EMPTY=null,Me.RED=!0,Me.BLACK=!1;Me.EMPTY=new class{constructor(){this.size=0}get key(){throw H(57766)}get value(){throw H(16141)}get color(){throw H(16727)}get left(){throw H(29726)}get right(){throw H(36894)}copy(e,t,r,s,o){return this}insert(e,t,r){return new Me(e,t)}remove(e,t){return this}isEmpty(){return!0}inorderTraversal(e){return!1}reverseTraversal(e){return!1}minKey(){return null}maxKey(){return null}isRed(){return!1}checkMaxDepth(){return!0}check(){return 0}};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class De{constructor(e){this.comparator=e,this.data=new Ae(this.comparator)}has(e){return this.data.get(e)!==null}first(){return this.data.minKey()}last(){return this.data.maxKey()}get size(){return this.data.size}indexOf(e){return this.data.indexOf(e)}forEach(e){this.data.inorderTraversal(((t,r)=>(e(t),!1)))}forEachInRange(e,t){const r=this.data.getIteratorFrom(e[0]);for(;r.hasNext();){const s=r.getNext();if(this.comparator(s.key,e[1])>=0)return;t(s.key)}}forEachWhile(e,t){let r;for(r=t!==void 0?this.data.getIteratorFrom(t):this.data.getIterator();r.hasNext();)if(!e(r.getNext().key))return}firstAfterOrEqual(e){const t=this.data.getIteratorFrom(e);return t.hasNext()?t.getNext().key:null}getIterator(){return new na(this.data.getIterator())}getIteratorFrom(e){return new na(this.data.getIteratorFrom(e))}add(e){return this.copy(this.data.remove(e).insert(e,!0))}delete(e){return this.has(e)?this.copy(this.data.remove(e)):this}isEmpty(){return this.data.isEmpty()}unionWith(e){let t=this;return t.size<e.size&&(t=e,e=this),e.forEach((r=>{t=t.add(r)})),t}isEqual(e){if(!(e instanceof De)||this.size!==e.size)return!1;const t=this.data.getIterator(),r=e.data.getIterator();for(;t.hasNext();){const s=t.getNext().key,o=r.getNext().key;if(this.comparator(s,o)!==0)return!1}return!0}toArray(){const e=[];return this.forEach((t=>{e.push(t)})),e}toString(){const e=[];return this.forEach((t=>e.push(t))),"SortedSet("+e.toString()+")"}copy(e){const t=new De(this.comparator);return t.data=e,t}}class na{constructor(e){this.iter=e}getNext(){return this.iter.getNext().key}hasNext(){return this.iter.hasNext()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class vt{constructor(e){this.fields=e,e.sort(ze.comparator)}static empty(){return new vt([])}unionWith(e){let t=new De(ze.comparator);for(const r of this.fields)t=t.add(r);for(const r of e)t=t.add(r);return new vt(t.toArray())}covers(e){for(const t of this.fields)if(t.isPrefixOf(e))return!0;return!1}isEqual(e){return hn(this.fields,e.fields,((t,r)=>t.isEqual(r)))}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class _l extends Error{constructor(){super(...arguments),this.name="Base64DecodeError"}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Oe{constructor(e){this.binaryString=e}static fromBase64String(e){const t=(function(s){try{return atob(s)}catch(o){throw typeof DOMException<"u"&&o instanceof DOMException?new _l("Invalid base64 string: "+o):o}})(e);return new Oe(t)}static fromUint8Array(e){const t=(function(s){let o="";for(let a=0;a<s.length;++a)o+=String.fromCharCode(s[a]);return o})(e);return new Oe(t)}[Symbol.iterator](){let e=0;return{next:()=>e<this.binaryString.length?{value:this.binaryString.charCodeAt(e++),done:!1}:{value:void 0,done:!0}}}toBase64(){return(function(t){return btoa(t)})(this.binaryString)}toUint8Array(){return(function(t){const r=new Uint8Array(t.length);for(let s=0;s<t.length;s++)r[s]=t.charCodeAt(s);return r})(this.binaryString)}approximateByteSize(){return 2*this.binaryString.length}compareTo(e){return Z(this.binaryString,e.binaryString)}isEqual(e){return this.binaryString===e.binaryString}}Oe.EMPTY_BYTE_STRING=new Oe("");const cd=new RegExp(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d+))?Z$/);function St(n){if(Ee(!!n,39018),typeof n=="string"){let e=0;const t=cd.exec(n);if(Ee(!!t,46558,{timestamp:n}),t[1]){let s=t[1];s=(s+"000000000").substr(0,9),e=Number(s)}const r=new Date(n);return{seconds:Math.floor(r.getTime()/1e3),nanos:e}}return{seconds:be(n.seconds),nanos:be(n.nanos)}}function be(n){return typeof n=="number"?n:typeof n=="string"?Number(n):0}function Rt(n){return typeof n=="string"?Oe.fromBase64String(n):Oe.fromUint8Array(n)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const El="server_timestamp",vl="__type__",Tl="__previous_value__",wl="__local_write_time__";function di(n){return(n?.mapValue?.fields||{})[vl]?.stringValue===El}function Xr(n){const e=n.mapValue.fields[Tl];return di(e)?Xr(e):e}function tr(n){const e=St(n.mapValue.fields[wl].timestampValue);return new pe(e.seconds,e.nanos)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ud{constructor(e,t,r,s,o,a,c,h,d,p){this.databaseId=e,this.appId=t,this.persistenceKey=r,this.host=s,this.ssl=o,this.forceLongPolling=a,this.autoDetectLongPolling=c,this.longPollingOptions=h,this.useFetchStreams=d,this.isUsingEmulator=p}}const Ur="(default)";class nr{constructor(e,t){this.projectId=e,this.database=t||Ur}static empty(){return new nr("","")}get isDefaultDatabase(){return this.database===Ur}isEqual(e){return e instanceof nr&&e.projectId===this.projectId&&e.database===this.database}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Il="__type__",hd="__max__",br={mapValue:{}},bl="__vector__",Br="value";function Ct(n){return"nullValue"in n?0:"booleanValue"in n?1:"integerValue"in n||"doubleValue"in n?2:"timestampValue"in n?3:"stringValue"in n?5:"bytesValue"in n?6:"referenceValue"in n?7:"geoPointValue"in n?8:"arrayValue"in n?9:"mapValue"in n?di(n)?4:fd(n)?9007199254740991:dd(n)?10:11:H(28295,{value:n})}function ct(n,e){if(n===e)return!0;const t=Ct(n);if(t!==Ct(e))return!1;switch(t){case 0:case 9007199254740991:return!0;case 1:return n.booleanValue===e.booleanValue;case 4:return tr(n).isEqual(tr(e));case 3:return(function(s,o){if(typeof s.timestampValue=="string"&&typeof o.timestampValue=="string"&&s.timestampValue.length===o.timestampValue.length)return s.timestampValue===o.timestampValue;const a=St(s.timestampValue),c=St(o.timestampValue);return a.seconds===c.seconds&&a.nanos===c.nanos})(n,e);case 5:return n.stringValue===e.stringValue;case 6:return(function(s,o){return Rt(s.bytesValue).isEqual(Rt(o.bytesValue))})(n,e);case 7:return n.referenceValue===e.referenceValue;case 8:return(function(s,o){return be(s.geoPointValue.latitude)===be(o.geoPointValue.latitude)&&be(s.geoPointValue.longitude)===be(o.geoPointValue.longitude)})(n,e);case 2:return(function(s,o){if("integerValue"in s&&"integerValue"in o)return be(s.integerValue)===be(o.integerValue);if("doubleValue"in s&&"doubleValue"in o){const a=be(s.doubleValue),c=be(o.doubleValue);return a===c?Lr(a)===Lr(c):isNaN(a)&&isNaN(c)}return!1})(n,e);case 9:return hn(n.arrayValue.values||[],e.arrayValue.values||[],ct);case 10:case 11:return(function(s,o){const a=s.mapValue.fields||{},c=o.mapValue.fields||{};if(ta(a)!==ta(c))return!1;for(const h in a)if(a.hasOwnProperty(h)&&(c[h]===void 0||!ct(a[h],c[h])))return!1;return!0})(n,e);default:return H(52216,{left:n})}}function rr(n,e){return(n.values||[]).find((t=>ct(t,e)))!==void 0}function dn(n,e){if(n===e)return 0;const t=Ct(n),r=Ct(e);if(t!==r)return Z(t,r);switch(t){case 0:case 9007199254740991:return 0;case 1:return Z(n.booleanValue,e.booleanValue);case 2:return(function(o,a){const c=be(o.integerValue||o.doubleValue),h=be(a.integerValue||a.doubleValue);return c<h?-1:c>h?1:c===h?0:isNaN(c)?isNaN(h)?0:-1:1})(n,e);case 3:return ra(n.timestampValue,e.timestampValue);case 4:return ra(tr(n),tr(e));case 5:return js(n.stringValue,e.stringValue);case 6:return(function(o,a){const c=Rt(o),h=Rt(a);return c.compareTo(h)})(n.bytesValue,e.bytesValue);case 7:return(function(o,a){const c=o.split("/"),h=a.split("/");for(let d=0;d<c.length&&d<h.length;d++){const p=Z(c[d],h[d]);if(p!==0)return p}return Z(c.length,h.length)})(n.referenceValue,e.referenceValue);case 8:return(function(o,a){const c=Z(be(o.latitude),be(a.latitude));return c!==0?c:Z(be(o.longitude),be(a.longitude))})(n.geoPointValue,e.geoPointValue);case 9:return sa(n.arrayValue,e.arrayValue);case 10:return(function(o,a){const c=o.fields||{},h=a.fields||{},d=c[Br]?.arrayValue,p=h[Br]?.arrayValue,m=Z(d?.values?.length||0,p?.values?.length||0);return m!==0?m:sa(d,p)})(n.mapValue,e.mapValue);case 11:return(function(o,a){if(o===br.mapValue&&a===br.mapValue)return 0;if(o===br.mapValue)return 1;if(a===br.mapValue)return-1;const c=o.fields||{},h=Object.keys(c),d=a.fields||{},p=Object.keys(d);h.sort(),p.sort();for(let m=0;m<h.length&&m<p.length;++m){const I=js(h[m],p[m]);if(I!==0)return I;const R=dn(c[h[m]],d[p[m]]);if(R!==0)return R}return Z(h.length,p.length)})(n.mapValue,e.mapValue);default:throw H(23264,{he:t})}}function ra(n,e){if(typeof n=="string"&&typeof e=="string"&&n.length===e.length)return Z(n,e);const t=St(n),r=St(e),s=Z(t.seconds,r.seconds);return s!==0?s:Z(t.nanos,r.nanos)}function sa(n,e){const t=n.values||[],r=e.values||[];for(let s=0;s<t.length&&s<r.length;++s){const o=dn(t[s],r[s]);if(o)return o}return Z(t.length,r.length)}function fn(n){return zs(n)}function zs(n){return"nullValue"in n?"null":"booleanValue"in n?""+n.booleanValue:"integerValue"in n?""+n.integerValue:"doubleValue"in n?""+n.doubleValue:"timestampValue"in n?(function(t){const r=St(t);return`time(${r.seconds},${r.nanos})`})(n.timestampValue):"stringValue"in n?n.stringValue:"bytesValue"in n?(function(t){return Rt(t).toBase64()})(n.bytesValue):"referenceValue"in n?(function(t){return q.fromName(t).toString()})(n.referenceValue):"geoPointValue"in n?(function(t){return`geo(${t.latitude},${t.longitude})`})(n.geoPointValue):"arrayValue"in n?(function(t){let r="[",s=!0;for(const o of t.values||[])s?s=!1:r+=",",r+=zs(o);return r+"]"})(n.arrayValue):"mapValue"in n?(function(t){const r=Object.keys(t.fields||{}).sort();let s="{",o=!0;for(const a of r)o?o=!1:s+=",",s+=`${a}:${zs(t.fields[a])}`;return s+"}"})(n.mapValue):H(61005,{value:n})}function xr(n){switch(Ct(n)){case 0:case 1:return 4;case 2:return 8;case 3:case 8:return 16;case 4:const e=Xr(n);return e?16+xr(e):16;case 5:return 2*n.stringValue.length;case 6:return Rt(n.bytesValue).approximateByteSize();case 7:return n.referenceValue.length;case 9:return(function(r){return(r.values||[]).reduce(((s,o)=>s+xr(o)),0)})(n.arrayValue);case 10:case 11:return(function(r){let s=0;return vn(r.fields,((o,a)=>{s+=o.length+xr(a)})),s})(n.mapValue);default:throw H(13486,{value:n})}}function ia(n,e){return{referenceValue:`projects/${n.projectId}/databases/${n.database}/documents/${e.path.canonicalString()}`}}function $s(n){return!!n&&"integerValue"in n}function fi(n){return!!n&&"arrayValue"in n}function oa(n){return!!n&&"nullValue"in n}function aa(n){return!!n&&"doubleValue"in n&&isNaN(Number(n.doubleValue))}function Cs(n){return!!n&&"mapValue"in n}function dd(n){return(n?.mapValue?.fields||{})[Il]?.stringValue===bl}function Kn(n){if(n.geoPointValue)return{geoPointValue:{...n.geoPointValue}};if(n.timestampValue&&typeof n.timestampValue=="object")return{timestampValue:{...n.timestampValue}};if(n.mapValue){const e={mapValue:{fields:{}}};return vn(n.mapValue.fields,((t,r)=>e.mapValue.fields[t]=Kn(r))),e}if(n.arrayValue){const e={arrayValue:{values:[]}};for(let t=0;t<(n.arrayValue.values||[]).length;++t)e.arrayValue.values[t]=Kn(n.arrayValue.values[t]);return e}return{...n}}function fd(n){return(((n.mapValue||{}).fields||{}).__type__||{}).stringValue===hd}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class it{constructor(e){this.value=e}static empty(){return new it({mapValue:{}})}field(e){if(e.isEmpty())return this.value;{let t=this.value;for(let r=0;r<e.length-1;++r)if(t=(t.mapValue.fields||{})[e.get(r)],!Cs(t))return null;return t=(t.mapValue.fields||{})[e.lastSegment()],t||null}}set(e,t){this.getFieldsMap(e.popLast())[e.lastSegment()]=Kn(t)}setAll(e){let t=ze.emptyPath(),r={},s=[];e.forEach(((a,c)=>{if(!t.isImmediateParentOf(c)){const h=this.getFieldsMap(t);this.applyChanges(h,r,s),r={},s=[],t=c.popLast()}a?r[c.lastSegment()]=Kn(a):s.push(c.lastSegment())}));const o=this.getFieldsMap(t);this.applyChanges(o,r,s)}delete(e){const t=this.field(e.popLast());Cs(t)&&t.mapValue.fields&&delete t.mapValue.fields[e.lastSegment()]}isEqual(e){return ct(this.value,e.value)}getFieldsMap(e){let t=this.value;t.mapValue.fields||(t.mapValue={fields:{}});for(let r=0;r<e.length;++r){let s=t.mapValue.fields[e.get(r)];Cs(s)&&s.mapValue.fields||(s={mapValue:{fields:{}}},t.mapValue.fields[e.get(r)]=s),t=s}return t.mapValue.fields}applyChanges(e,t,r){vn(t,((s,o)=>e[s]=o));for(const s of r)delete e[s]}clone(){return new it(Kn(this.value))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class je{constructor(e,t,r,s,o,a,c){this.key=e,this.documentType=t,this.version=r,this.readTime=s,this.createTime=o,this.data=a,this.documentState=c}static newInvalidDocument(e){return new je(e,0,G.min(),G.min(),G.min(),it.empty(),0)}static newFoundDocument(e,t,r,s){return new je(e,1,t,G.min(),r,s,0)}static newNoDocument(e,t){return new je(e,2,t,G.min(),G.min(),it.empty(),0)}static newUnknownDocument(e,t){return new je(e,3,t,G.min(),G.min(),it.empty(),2)}convertToFoundDocument(e,t){return!this.createTime.isEqual(G.min())||this.documentType!==2&&this.documentType!==0||(this.createTime=e),this.version=e,this.documentType=1,this.data=t,this.documentState=0,this}convertToNoDocument(e){return this.version=e,this.documentType=2,this.data=it.empty(),this.documentState=0,this}convertToUnknownDocument(e){return this.version=e,this.documentType=3,this.data=it.empty(),this.documentState=2,this}setHasCommittedMutations(){return this.documentState=2,this}setHasLocalMutations(){return this.documentState=1,this.version=G.min(),this}setReadTime(e){return this.readTime=e,this}get hasLocalMutations(){return this.documentState===1}get hasCommittedMutations(){return this.documentState===2}get hasPendingWrites(){return this.hasLocalMutations||this.hasCommittedMutations}isValidDocument(){return this.documentType!==0}isFoundDocument(){return this.documentType===1}isNoDocument(){return this.documentType===2}isUnknownDocument(){return this.documentType===3}isEqual(e){return e instanceof je&&this.key.isEqual(e.key)&&this.version.isEqual(e.version)&&this.documentType===e.documentType&&this.documentState===e.documentState&&this.data.isEqual(e.data)}mutableCopy(){return new je(this.key,this.documentType,this.version,this.readTime,this.createTime,this.data.clone(),this.documentState)}toString(){return`Document(${this.key}, ${this.version}, ${JSON.stringify(this.data.value)}, {createTime: ${this.createTime}}), {documentType: ${this.documentType}}), {documentState: ${this.documentState}})`}}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class jr{constructor(e,t){this.position=e,this.inclusive=t}}function la(n,e,t){let r=0;for(let s=0;s<n.position.length;s++){const o=e[s],a=n.position[s];if(o.field.isKeyField()?r=q.comparator(q.fromName(a.referenceValue),t.key):r=dn(a,t.data.field(o.field)),o.dir==="desc"&&(r*=-1),r!==0)break}return r}function ca(n,e){if(n===null)return e===null;if(e===null||n.inclusive!==e.inclusive||n.position.length!==e.position.length)return!1;for(let t=0;t<n.position.length;t++)if(!ct(n.position[t],e.position[t]))return!1;return!0}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class sr{constructor(e,t="asc"){this.field=e,this.dir=t}}function pd(n,e){return n.dir===e.dir&&n.field.isEqual(e.field)}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Al{}class Ce extends Al{constructor(e,t,r){super(),this.field=e,this.op=t,this.value=r}static create(e,t,r){return e.isKeyField()?t==="in"||t==="not-in"?this.createKeyFieldInFilter(e,t,r):new gd(e,t,r):t==="array-contains"?new Ed(e,r):t==="in"?new vd(e,r):t==="not-in"?new Td(e,r):t==="array-contains-any"?new wd(e,r):new Ce(e,t,r)}static createKeyFieldInFilter(e,t,r){return t==="in"?new yd(e,r):new _d(e,r)}matches(e){const t=e.data.field(this.field);return this.op==="!="?t!==null&&t.nullValue===void 0&&this.matchesComparison(dn(t,this.value)):t!==null&&Ct(this.value)===Ct(t)&&this.matchesComparison(dn(t,this.value))}matchesComparison(e){switch(this.op){case"<":return e<0;case"<=":return e<=0;case"==":return e===0;case"!=":return e!==0;case">":return e>0;case">=":return e>=0;default:return H(47266,{operator:this.op})}}isInequality(){return["<","<=",">",">=","!=","not-in"].indexOf(this.op)>=0}getFlattenedFilters(){return[this]}getFilters(){return[this]}}class Je extends Al{constructor(e,t){super(),this.filters=e,this.op=t,this.Pe=null}static create(e,t){return new Je(e,t)}matches(e){return Sl(this)?this.filters.find((t=>!t.matches(e)))===void 0:this.filters.find((t=>t.matches(e)))!==void 0}getFlattenedFilters(){return this.Pe!==null||(this.Pe=this.filters.reduce(((e,t)=>e.concat(t.getFlattenedFilters())),[])),this.Pe}getFilters(){return Object.assign([],this.filters)}}function Sl(n){return n.op==="and"}function Rl(n){return md(n)&&Sl(n)}function md(n){for(const e of n.filters)if(e instanceof Je)return!1;return!0}function qs(n){if(n instanceof Ce)return n.field.canonicalString()+n.op.toString()+fn(n.value);if(Rl(n))return n.filters.map((e=>qs(e))).join(",");{const e=n.filters.map((t=>qs(t))).join(",");return`${n.op}(${e})`}}function Cl(n,e){return n instanceof Ce?(function(r,s){return s instanceof Ce&&r.op===s.op&&r.field.isEqual(s.field)&&ct(r.value,s.value)})(n,e):n instanceof Je?(function(r,s){return s instanceof Je&&r.op===s.op&&r.filters.length===s.filters.length?r.filters.reduce(((o,a,c)=>o&&Cl(a,s.filters[c])),!0):!1})(n,e):void H(19439)}function Pl(n){return n instanceof Ce?(function(t){return`${t.field.canonicalString()} ${t.op} ${fn(t.value)}`})(n):n instanceof Je?(function(t){return t.op.toString()+" {"+t.getFilters().map(Pl).join(" ,")+"}"})(n):"Filter"}class gd extends Ce{constructor(e,t,r){super(e,t,r),this.key=q.fromName(r.referenceValue)}matches(e){const t=q.comparator(e.key,this.key);return this.matchesComparison(t)}}class yd extends Ce{constructor(e,t){super(e,"in",t),this.keys=xl("in",t)}matches(e){return this.keys.some((t=>t.isEqual(e.key)))}}class _d extends Ce{constructor(e,t){super(e,"not-in",t),this.keys=xl("not-in",t)}matches(e){return!this.keys.some((t=>t.isEqual(e.key)))}}function xl(n,e){return(e.arrayValue?.values||[]).map((t=>q.fromName(t.referenceValue)))}class Ed extends Ce{constructor(e,t){super(e,"array-contains",t)}matches(e){const t=e.data.field(this.field);return fi(t)&&rr(t.arrayValue,this.value)}}class vd extends Ce{constructor(e,t){super(e,"in",t)}matches(e){const t=e.data.field(this.field);return t!==null&&rr(this.value.arrayValue,t)}}class Td extends Ce{constructor(e,t){super(e,"not-in",t)}matches(e){if(rr(this.value.arrayValue,{nullValue:"NULL_VALUE"}))return!1;const t=e.data.field(this.field);return t!==null&&t.nullValue===void 0&&!rr(this.value.arrayValue,t)}}class wd extends Ce{constructor(e,t){super(e,"array-contains-any",t)}matches(e){const t=e.data.field(this.field);return!(!fi(t)||!t.arrayValue.values)&&t.arrayValue.values.some((r=>rr(this.value.arrayValue,r)))}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Id{constructor(e,t=null,r=[],s=[],o=null,a=null,c=null){this.path=e,this.collectionGroup=t,this.orderBy=r,this.filters=s,this.limit=o,this.startAt=a,this.endAt=c,this.Te=null}}function ua(n,e=null,t=[],r=[],s=null,o=null,a=null){return new Id(n,e,t,r,s,o,a)}function pi(n){const e=ne(n);if(e.Te===null){let t=e.path.canonicalString();e.collectionGroup!==null&&(t+="|cg:"+e.collectionGroup),t+="|f:",t+=e.filters.map((r=>qs(r))).join(","),t+="|ob:",t+=e.orderBy.map((r=>(function(o){return o.field.canonicalString()+o.dir})(r))).join(","),Yr(e.limit)||(t+="|l:",t+=e.limit),e.startAt&&(t+="|lb:",t+=e.startAt.inclusive?"b:":"a:",t+=e.startAt.position.map((r=>fn(r))).join(",")),e.endAt&&(t+="|ub:",t+=e.endAt.inclusive?"a:":"b:",t+=e.endAt.position.map((r=>fn(r))).join(",")),e.Te=t}return e.Te}function mi(n,e){if(n.limit!==e.limit||n.orderBy.length!==e.orderBy.length)return!1;for(let t=0;t<n.orderBy.length;t++)if(!pd(n.orderBy[t],e.orderBy[t]))return!1;if(n.filters.length!==e.filters.length)return!1;for(let t=0;t<n.filters.length;t++)if(!Cl(n.filters[t],e.filters[t]))return!1;return n.collectionGroup===e.collectionGroup&&!!n.path.isEqual(e.path)&&!!ca(n.startAt,e.startAt)&&ca(n.endAt,e.endAt)}function Gs(n){return q.isDocumentKey(n.path)&&n.collectionGroup===null&&n.filters.length===0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Tn{constructor(e,t=null,r=[],s=[],o=null,a="F",c=null,h=null){this.path=e,this.collectionGroup=t,this.explicitOrderBy=r,this.filters=s,this.limit=o,this.limitType=a,this.startAt=c,this.endAt=h,this.Ie=null,this.Ee=null,this.de=null,this.startAt,this.endAt}}function bd(n,e,t,r,s,o,a,c){return new Tn(n,e,t,r,s,o,a,c)}function gi(n){return new Tn(n)}function ha(n){return n.filters.length===0&&n.limit===null&&n.startAt==null&&n.endAt==null&&(n.explicitOrderBy.length===0||n.explicitOrderBy.length===1&&n.explicitOrderBy[0].field.isKeyField())}function Vl(n){return n.collectionGroup!==null}function Wn(n){const e=ne(n);if(e.Ie===null){e.Ie=[];const t=new Set;for(const o of e.explicitOrderBy)e.Ie.push(o),t.add(o.field.canonicalString());const r=e.explicitOrderBy.length>0?e.explicitOrderBy[e.explicitOrderBy.length-1].dir:"asc";(function(a){let c=new De(ze.comparator);return a.filters.forEach((h=>{h.getFlattenedFilters().forEach((d=>{d.isInequality()&&(c=c.add(d.field))}))})),c})(e).forEach((o=>{t.has(o.canonicalString())||o.isKeyField()||e.Ie.push(new sr(o,r))})),t.has(ze.keyField().canonicalString())||e.Ie.push(new sr(ze.keyField(),r))}return e.Ie}function ot(n){const e=ne(n);return e.Ee||(e.Ee=Ad(e,Wn(n))),e.Ee}function Ad(n,e){if(n.limitType==="F")return ua(n.path,n.collectionGroup,e,n.filters,n.limit,n.startAt,n.endAt);{e=e.map((s=>{const o=s.dir==="desc"?"asc":"desc";return new sr(s.field,o)}));const t=n.endAt?new jr(n.endAt.position,n.endAt.inclusive):null,r=n.startAt?new jr(n.startAt.position,n.startAt.inclusive):null;return ua(n.path,n.collectionGroup,e,n.filters,n.limit,t,r)}}function Hs(n,e){const t=n.filters.concat([e]);return new Tn(n.path,n.collectionGroup,n.explicitOrderBy.slice(),t,n.limit,n.limitType,n.startAt,n.endAt)}function Ks(n,e,t){return new Tn(n.path,n.collectionGroup,n.explicitOrderBy.slice(),n.filters.slice(),e,t,n.startAt,n.endAt)}function Jr(n,e){return mi(ot(n),ot(e))&&n.limitType===e.limitType}function Dl(n){return`${pi(ot(n))}|lt:${n.limitType}`}function en(n){return`Query(target=${(function(t){let r=t.path.canonicalString();return t.collectionGroup!==null&&(r+=" collectionGroup="+t.collectionGroup),t.filters.length>0&&(r+=`, filters: [${t.filters.map((s=>Pl(s))).join(", ")}]`),Yr(t.limit)||(r+=", limit: "+t.limit),t.orderBy.length>0&&(r+=`, orderBy: [${t.orderBy.map((s=>(function(a){return`${a.field.canonicalString()} (${a.dir})`})(s))).join(", ")}]`),t.startAt&&(r+=", startAt: ",r+=t.startAt.inclusive?"b:":"a:",r+=t.startAt.position.map((s=>fn(s))).join(",")),t.endAt&&(r+=", endAt: ",r+=t.endAt.inclusive?"a:":"b:",r+=t.endAt.position.map((s=>fn(s))).join(",")),`Target(${r})`})(ot(n))}; limitType=${n.limitType})`}function Zr(n,e){return e.isFoundDocument()&&(function(r,s){const o=s.key.path;return r.collectionGroup!==null?s.key.hasCollectionId(r.collectionGroup)&&r.path.isPrefixOf(o):q.isDocumentKey(r.path)?r.path.isEqual(o):r.path.isImmediateParentOf(o)})(n,e)&&(function(r,s){for(const o of Wn(r))if(!o.field.isKeyField()&&s.data.field(o.field)===null)return!1;return!0})(n,e)&&(function(r,s){for(const o of r.filters)if(!o.matches(s))return!1;return!0})(n,e)&&(function(r,s){return!(r.startAt&&!(function(a,c,h){const d=la(a,c,h);return a.inclusive?d<=0:d<0})(r.startAt,Wn(r),s)||r.endAt&&!(function(a,c,h){const d=la(a,c,h);return a.inclusive?d>=0:d>0})(r.endAt,Wn(r),s))})(n,e)}function Sd(n){return n.collectionGroup||(n.path.length%2==1?n.path.lastSegment():n.path.get(n.path.length-2))}function kl(n){return(e,t)=>{let r=!1;for(const s of Wn(n)){const o=Rd(s,e,t);if(o!==0)return o;r=r||s.field.isKeyField()}return 0}}function Rd(n,e,t){const r=n.field.isKeyField()?q.comparator(e.key,t.key):(function(o,a,c){const h=a.data.field(o),d=c.data.field(o);return h!==null&&d!==null?dn(h,d):H(42886)})(n.field,e,t);switch(n.dir){case"asc":return r;case"desc":return-1*r;default:return H(19790,{direction:n.dir})}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class $t{constructor(e,t){this.mapKeyFn=e,this.equalsFn=t,this.inner={},this.innerSize=0}get(e){const t=this.mapKeyFn(e),r=this.inner[t];if(r!==void 0){for(const[s,o]of r)if(this.equalsFn(s,e))return o}}has(e){return this.get(e)!==void 0}set(e,t){const r=this.mapKeyFn(e),s=this.inner[r];if(s===void 0)return this.inner[r]=[[e,t]],void this.innerSize++;for(let o=0;o<s.length;o++)if(this.equalsFn(s[o][0],e))return void(s[o]=[e,t]);s.push([e,t]),this.innerSize++}delete(e){const t=this.mapKeyFn(e),r=this.inner[t];if(r===void 0)return!1;for(let s=0;s<r.length;s++)if(this.equalsFn(r[s][0],e))return r.length===1?delete this.inner[t]:r.splice(s,1),this.innerSize--,!0;return!1}forEach(e){vn(this.inner,((t,r)=>{for(const[s,o]of r)e(s,o)}))}isEmpty(){return yl(this.inner)}size(){return this.innerSize}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Cd=new Ae(q.comparator);function Pt(){return Cd}const Nl=new Ae(q.comparator);function $n(...n){let e=Nl;for(const t of n)e=e.insert(t.key,t);return e}function Pd(n){let e=Nl;return n.forEach(((t,r)=>e=e.insert(t,r.overlayedDocument))),e}function Ut(){return Qn()}function Fl(){return Qn()}function Qn(){return new $t((n=>n.toString()),((n,e)=>n.isEqual(e)))}const xd=new De(q.comparator);function se(...n){let e=xd;for(const t of n)e=e.add(t);return e}const Vd=new De(Z);function Dd(){return Vd}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function yi(n,e){if(n.useProto3Json){if(isNaN(e))return{doubleValue:"NaN"};if(e===1/0)return{doubleValue:"Infinity"};if(e===-1/0)return{doubleValue:"-Infinity"}}return{doubleValue:Lr(e)?"-0":e}}function Ml(n){return{integerValue:""+n}}function kd(n,e){return od(e)?Ml(e):yi(n,e)}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class es{constructor(){this._=void 0}}function Nd(n,e,t){return n instanceof Ws?(function(s,o){const a={fields:{[vl]:{stringValue:El},[wl]:{timestampValue:{seconds:s.seconds,nanos:s.nanoseconds}}}};return o&&di(o)&&(o=Xr(o)),o&&(a.fields[Tl]=o),{mapValue:a}})(t,e):n instanceof zr?Ol(n,e):n instanceof $r?Ll(n,e):(function(s,o){const a=Md(s,o),c=da(a)+da(s.Ae);return $s(a)&&$s(s.Ae)?Ml(c):yi(s.serializer,c)})(n,e)}function Fd(n,e,t){return n instanceof zr?Ol(n,e):n instanceof $r?Ll(n,e):t}function Md(n,e){return n instanceof Qs?(function(r){return $s(r)||(function(o){return!!o&&"doubleValue"in o})(r)})(e)?e:{integerValue:0}:null}class Ws extends es{}class zr extends es{constructor(e){super(),this.elements=e}}function Ol(n,e){const t=Ul(e);for(const r of n.elements)t.some((s=>ct(s,r)))||t.push(r);return{arrayValue:{values:t}}}class $r extends es{constructor(e){super(),this.elements=e}}function Ll(n,e){let t=Ul(e);for(const r of n.elements)t=t.filter((s=>!ct(s,r)));return{arrayValue:{values:t}}}class Qs extends es{constructor(e,t){super(),this.serializer=e,this.Ae=t}}function da(n){return be(n.integerValue||n.doubleValue)}function Ul(n){return fi(n)&&n.arrayValue.values?n.arrayValue.values.slice():[]}function Od(n,e){return n.field.isEqual(e.field)&&(function(r,s){return r instanceof zr&&s instanceof zr||r instanceof $r&&s instanceof $r?hn(r.elements,s.elements,ct):r instanceof Qs&&s instanceof Qs?ct(r.Ae,s.Ae):r instanceof Ws&&s instanceof Ws})(n.transform,e.transform)}class Bt{constructor(e,t){this.updateTime=e,this.exists=t}static none(){return new Bt}static exists(e){return new Bt(void 0,e)}static updateTime(e){return new Bt(e)}get isNone(){return this.updateTime===void 0&&this.exists===void 0}isEqual(e){return this.exists===e.exists&&(this.updateTime?!!e.updateTime&&this.updateTime.isEqual(e.updateTime):!e.updateTime)}}function Vr(n,e){return n.updateTime!==void 0?e.isFoundDocument()&&e.version.isEqual(n.updateTime):n.exists===void 0||n.exists===e.isFoundDocument()}class _i{}function Bl(n,e){if(!n.hasLocalMutations||e&&e.fields.length===0)return null;if(e===null)return n.isNoDocument()?new Ud(n.key,Bt.none()):new Ei(n.key,n.data,Bt.none());{const t=n.data,r=it.empty();let s=new De(ze.comparator);for(let o of e.fields)if(!s.has(o)){let a=t.field(o);a===null&&o.length>1&&(o=o.popLast(),a=t.field(o)),a===null?r.delete(o):r.set(o,a),s=s.add(o)}return new ts(n.key,r,new vt(s.toArray()),Bt.none())}}function Ld(n,e,t){n instanceof Ei?(function(s,o,a){const c=s.value.clone(),h=pa(s.fieldTransforms,o,a.transformResults);c.setAll(h),o.convertToFoundDocument(a.version,c).setHasCommittedMutations()})(n,e,t):n instanceof ts?(function(s,o,a){if(!Vr(s.precondition,o))return void o.convertToUnknownDocument(a.version);const c=pa(s.fieldTransforms,o,a.transformResults),h=o.data;h.setAll(jl(s)),h.setAll(c),o.convertToFoundDocument(a.version,h).setHasCommittedMutations()})(n,e,t):(function(s,o,a){o.convertToNoDocument(a.version).setHasCommittedMutations()})(0,e,t)}function Yn(n,e,t,r){return n instanceof Ei?(function(o,a,c,h){if(!Vr(o.precondition,a))return c;const d=o.value.clone(),p=ma(o.fieldTransforms,h,a);return d.setAll(p),a.convertToFoundDocument(a.version,d).setHasLocalMutations(),null})(n,e,t,r):n instanceof ts?(function(o,a,c,h){if(!Vr(o.precondition,a))return c;const d=ma(o.fieldTransforms,h,a),p=a.data;return p.setAll(jl(o)),p.setAll(d),a.convertToFoundDocument(a.version,p).setHasLocalMutations(),c===null?null:c.unionWith(o.fieldMask.fields).unionWith(o.fieldTransforms.map((m=>m.field)))})(n,e,t,r):(function(o,a,c){return Vr(o.precondition,a)?(a.convertToNoDocument(a.version).setHasLocalMutations(),null):c})(n,e,t)}function fa(n,e){return n.type===e.type&&!!n.key.isEqual(e.key)&&!!n.precondition.isEqual(e.precondition)&&!!(function(r,s){return r===void 0&&s===void 0||!(!r||!s)&&hn(r,s,((o,a)=>Od(o,a)))})(n.fieldTransforms,e.fieldTransforms)&&(n.type===0?n.value.isEqual(e.value):n.type!==1||n.data.isEqual(e.data)&&n.fieldMask.isEqual(e.fieldMask))}class Ei extends _i{constructor(e,t,r,s=[]){super(),this.key=e,this.value=t,this.precondition=r,this.fieldTransforms=s,this.type=0}getFieldMask(){return null}}class ts extends _i{constructor(e,t,r,s,o=[]){super(),this.key=e,this.data=t,this.fieldMask=r,this.precondition=s,this.fieldTransforms=o,this.type=1}getFieldMask(){return this.fieldMask}}function jl(n){const e=new Map;return n.fieldMask.fields.forEach((t=>{if(!t.isEmpty()){const r=n.data.field(t);e.set(t,r)}})),e}function pa(n,e,t){const r=new Map;Ee(n.length===t.length,32656,{Re:t.length,Ve:n.length});for(let s=0;s<t.length;s++){const o=n[s],a=o.transform,c=e.data.field(o.field);r.set(o.field,Fd(a,c,t[s]))}return r}function ma(n,e,t){const r=new Map;for(const s of n){const o=s.transform,a=t.data.field(s.field);r.set(s.field,Nd(o,a,e))}return r}class Ud extends _i{constructor(e,t){super(),this.key=e,this.precondition=t,this.type=2,this.fieldTransforms=[]}getFieldMask(){return null}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Bd{constructor(e,t,r,s){this.batchId=e,this.localWriteTime=t,this.baseMutations=r,this.mutations=s}applyToRemoteDocument(e,t){const r=t.mutationResults;for(let s=0;s<this.mutations.length;s++){const o=this.mutations[s];o.key.isEqual(e.key)&&Ld(o,e,r[s])}}applyToLocalView(e,t){for(const r of this.baseMutations)r.key.isEqual(e.key)&&(t=Yn(r,e,t,this.localWriteTime));for(const r of this.mutations)r.key.isEqual(e.key)&&(t=Yn(r,e,t,this.localWriteTime));return t}applyToLocalDocumentSet(e,t){const r=Fl();return this.mutations.forEach((s=>{const o=e.get(s.key),a=o.overlayedDocument;let c=this.applyToLocalView(a,o.mutatedFields);c=t.has(s.key)?null:c;const h=Bl(a,c);h!==null&&r.set(s.key,h),a.isValidDocument()||a.convertToNoDocument(G.min())})),r}keys(){return this.mutations.reduce(((e,t)=>e.add(t.key)),se())}isEqual(e){return this.batchId===e.batchId&&hn(this.mutations,e.mutations,((t,r)=>fa(t,r)))&&hn(this.baseMutations,e.baseMutations,((t,r)=>fa(t,r)))}}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class jd{constructor(e,t){this.largestBatchId=e,this.mutation=t}getKey(){return this.mutation.key}isEqual(e){return e!==null&&this.mutation===e.mutation}toString(){return`Overlay{
      largestBatchId: ${this.largestBatchId},
      mutation: ${this.mutation.toString()}
    }`}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class zd{constructor(e,t){this.count=e,this.unchangedNames=t}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */var Re,ee;function zl(n){if(n===void 0)return ht("GRPC error has no .code"),D.UNKNOWN;switch(n){case Re.OK:return D.OK;case Re.CANCELLED:return D.CANCELLED;case Re.UNKNOWN:return D.UNKNOWN;case Re.DEADLINE_EXCEEDED:return D.DEADLINE_EXCEEDED;case Re.RESOURCE_EXHAUSTED:return D.RESOURCE_EXHAUSTED;case Re.INTERNAL:return D.INTERNAL;case Re.UNAVAILABLE:return D.UNAVAILABLE;case Re.UNAUTHENTICATED:return D.UNAUTHENTICATED;case Re.INVALID_ARGUMENT:return D.INVALID_ARGUMENT;case Re.NOT_FOUND:return D.NOT_FOUND;case Re.ALREADY_EXISTS:return D.ALREADY_EXISTS;case Re.PERMISSION_DENIED:return D.PERMISSION_DENIED;case Re.FAILED_PRECONDITION:return D.FAILED_PRECONDITION;case Re.ABORTED:return D.ABORTED;case Re.OUT_OF_RANGE:return D.OUT_OF_RANGE;case Re.UNIMPLEMENTED:return D.UNIMPLEMENTED;case Re.DATA_LOSS:return D.DATA_LOSS;default:return H(39323,{code:n})}}(ee=Re||(Re={}))[ee.OK=0]="OK",ee[ee.CANCELLED=1]="CANCELLED",ee[ee.UNKNOWN=2]="UNKNOWN",ee[ee.INVALID_ARGUMENT=3]="INVALID_ARGUMENT",ee[ee.DEADLINE_EXCEEDED=4]="DEADLINE_EXCEEDED",ee[ee.NOT_FOUND=5]="NOT_FOUND",ee[ee.ALREADY_EXISTS=6]="ALREADY_EXISTS",ee[ee.PERMISSION_DENIED=7]="PERMISSION_DENIED",ee[ee.UNAUTHENTICATED=16]="UNAUTHENTICATED",ee[ee.RESOURCE_EXHAUSTED=8]="RESOURCE_EXHAUSTED",ee[ee.FAILED_PRECONDITION=9]="FAILED_PRECONDITION",ee[ee.ABORTED=10]="ABORTED",ee[ee.OUT_OF_RANGE=11]="OUT_OF_RANGE",ee[ee.UNIMPLEMENTED=12]="UNIMPLEMENTED",ee[ee.INTERNAL=13]="INTERNAL",ee[ee.UNAVAILABLE=14]="UNAVAILABLE",ee[ee.DATA_LOSS=15]="DATA_LOSS";/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function $d(){return new TextEncoder}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const qd=new bt([4294967295,4294967295],0);function ga(n){const e=$d().encode(n),t=new ol;return t.update(e),new Uint8Array(t.digest())}function ya(n){const e=new DataView(n.buffer),t=e.getUint32(0,!0),r=e.getUint32(4,!0),s=e.getUint32(8,!0),o=e.getUint32(12,!0);return[new bt([t,r],0),new bt([s,o],0)]}class vi{constructor(e,t,r){if(this.bitmap=e,this.padding=t,this.hashCount=r,t<0||t>=8)throw new qn(`Invalid padding: ${t}`);if(r<0)throw new qn(`Invalid hash count: ${r}`);if(e.length>0&&this.hashCount===0)throw new qn(`Invalid hash count: ${r}`);if(e.length===0&&t!==0)throw new qn(`Invalid padding when bitmap length is 0: ${t}`);this.ge=8*e.length-t,this.pe=bt.fromNumber(this.ge)}ye(e,t,r){let s=e.add(t.multiply(bt.fromNumber(r)));return s.compare(qd)===1&&(s=new bt([s.getBits(0),s.getBits(1)],0)),s.modulo(this.pe).toNumber()}we(e){return!!(this.bitmap[Math.floor(e/8)]&1<<e%8)}mightContain(e){if(this.ge===0)return!1;const t=ga(e),[r,s]=ya(t);for(let o=0;o<this.hashCount;o++){const a=this.ye(r,s,o);if(!this.we(a))return!1}return!0}static create(e,t,r){const s=e%8==0?0:8-e%8,o=new Uint8Array(Math.ceil(e/8)),a=new vi(o,s,t);return r.forEach((c=>a.insert(c))),a}insert(e){if(this.ge===0)return;const t=ga(e),[r,s]=ya(t);for(let o=0;o<this.hashCount;o++){const a=this.ye(r,s,o);this.Se(a)}}Se(e){const t=Math.floor(e/8),r=e%8;this.bitmap[t]|=1<<r}}class qn extends Error{constructor(){super(...arguments),this.name="BloomFilterError"}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ns{constructor(e,t,r,s,o){this.snapshotVersion=e,this.targetChanges=t,this.targetMismatches=r,this.documentUpdates=s,this.resolvedLimboDocuments=o}static createSynthesizedRemoteEventForCurrentChange(e,t,r){const s=new Map;return s.set(e,or.createSynthesizedTargetChangeForCurrentChange(e,t,r)),new ns(G.min(),s,new Ae(Z),Pt(),se())}}class or{constructor(e,t,r,s,o){this.resumeToken=e,this.current=t,this.addedDocuments=r,this.modifiedDocuments=s,this.removedDocuments=o}static createSynthesizedTargetChangeForCurrentChange(e,t,r){return new or(r,t,se(),se(),se())}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Dr{constructor(e,t,r,s){this.be=e,this.removedTargetIds=t,this.key=r,this.De=s}}class $l{constructor(e,t){this.targetId=e,this.Ce=t}}class ql{constructor(e,t,r=Oe.EMPTY_BYTE_STRING,s=null){this.state=e,this.targetIds=t,this.resumeToken=r,this.cause=s}}class _a{constructor(){this.ve=0,this.Fe=Ea(),this.Me=Oe.EMPTY_BYTE_STRING,this.xe=!1,this.Oe=!0}get current(){return this.xe}get resumeToken(){return this.Me}get Ne(){return this.ve!==0}get Be(){return this.Oe}Le(e){e.approximateByteSize()>0&&(this.Oe=!0,this.Me=e)}ke(){let e=se(),t=se(),r=se();return this.Fe.forEach(((s,o)=>{switch(o){case 0:e=e.add(s);break;case 2:t=t.add(s);break;case 1:r=r.add(s);break;default:H(38017,{changeType:o})}})),new or(this.Me,this.xe,e,t,r)}qe(){this.Oe=!1,this.Fe=Ea()}Qe(e,t){this.Oe=!0,this.Fe=this.Fe.insert(e,t)}$e(e){this.Oe=!0,this.Fe=this.Fe.remove(e)}Ue(){this.ve+=1}Ke(){this.ve-=1,Ee(this.ve>=0,3241,{ve:this.ve})}We(){this.Oe=!0,this.xe=!0}}class Gd{constructor(e){this.Ge=e,this.ze=new Map,this.je=Pt(),this.Je=Ar(),this.He=Ar(),this.Ye=new Ae(Z)}Ze(e){for(const t of e.be)e.De&&e.De.isFoundDocument()?this.Xe(t,e.De):this.et(t,e.key,e.De);for(const t of e.removedTargetIds)this.et(t,e.key,e.De)}tt(e){this.forEachTarget(e,(t=>{const r=this.nt(t);switch(e.state){case 0:this.rt(t)&&r.Le(e.resumeToken);break;case 1:r.Ke(),r.Ne||r.qe(),r.Le(e.resumeToken);break;case 2:r.Ke(),r.Ne||this.removeTarget(t);break;case 3:this.rt(t)&&(r.We(),r.Le(e.resumeToken));break;case 4:this.rt(t)&&(this.it(t),r.Le(e.resumeToken));break;default:H(56790,{state:e.state})}}))}forEachTarget(e,t){e.targetIds.length>0?e.targetIds.forEach(t):this.ze.forEach(((r,s)=>{this.rt(s)&&t(s)}))}st(e){const t=e.targetId,r=e.Ce.count,s=this.ot(t);if(s){const o=s.target;if(Gs(o))if(r===0){const a=new q(o.path);this.et(t,a,je.newNoDocument(a,G.min()))}else Ee(r===1,20013,{expectedCount:r});else{const a=this._t(t);if(a!==r){const c=this.ut(e),h=c?this.ct(c,e,a):1;if(h!==0){this.it(t);const d=h===2?"TargetPurposeExistenceFilterMismatchBloom":"TargetPurposeExistenceFilterMismatch";this.Ye=this.Ye.insert(t,d)}}}}}ut(e){const t=e.Ce.unchangedNames;if(!t||!t.bits)return null;const{bits:{bitmap:r="",padding:s=0},hashCount:o=0}=t;let a,c;try{a=Rt(r).toUint8Array()}catch(h){if(h instanceof _l)return un("Decoding the base64 bloom filter in existence filter failed ("+h.message+"); ignoring the bloom filter and falling back to full re-query."),null;throw h}try{c=new vi(a,s,o)}catch(h){return un(h instanceof qn?"BloomFilter error: ":"Applying bloom filter failed: ",h),null}return c.ge===0?null:c}ct(e,t,r){return t.Ce.count===r-this.Pt(e,t.targetId)?0:2}Pt(e,t){const r=this.Ge.getRemoteKeysForTarget(t);let s=0;return r.forEach((o=>{const a=this.Ge.ht(),c=`projects/${a.projectId}/databases/${a.database}/documents/${o.path.canonicalString()}`;e.mightContain(c)||(this.et(t,o,null),s++)})),s}Tt(e){const t=new Map;this.ze.forEach(((o,a)=>{const c=this.ot(a);if(c){if(o.current&&Gs(c.target)){const h=new q(c.target.path);this.It(h).has(a)||this.Et(a,h)||this.et(a,h,je.newNoDocument(h,e))}o.Be&&(t.set(a,o.ke()),o.qe())}}));let r=se();this.He.forEach(((o,a)=>{let c=!0;a.forEachWhile((h=>{const d=this.ot(h);return!d||d.purpose==="TargetPurposeLimboResolution"||(c=!1,!1)})),c&&(r=r.add(o))})),this.je.forEach(((o,a)=>a.setReadTime(e)));const s=new ns(e,t,this.Ye,this.je,r);return this.je=Pt(),this.Je=Ar(),this.He=Ar(),this.Ye=new Ae(Z),s}Xe(e,t){if(!this.rt(e))return;const r=this.Et(e,t.key)?2:0;this.nt(e).Qe(t.key,r),this.je=this.je.insert(t.key,t),this.Je=this.Je.insert(t.key,this.It(t.key).add(e)),this.He=this.He.insert(t.key,this.dt(t.key).add(e))}et(e,t,r){if(!this.rt(e))return;const s=this.nt(e);this.Et(e,t)?s.Qe(t,1):s.$e(t),this.He=this.He.insert(t,this.dt(t).delete(e)),this.He=this.He.insert(t,this.dt(t).add(e)),r&&(this.je=this.je.insert(t,r))}removeTarget(e){this.ze.delete(e)}_t(e){const t=this.nt(e).ke();return this.Ge.getRemoteKeysForTarget(e).size+t.addedDocuments.size-t.removedDocuments.size}Ue(e){this.nt(e).Ue()}nt(e){let t=this.ze.get(e);return t||(t=new _a,this.ze.set(e,t)),t}dt(e){let t=this.He.get(e);return t||(t=new De(Z),this.He=this.He.insert(e,t)),t}It(e){let t=this.Je.get(e);return t||(t=new De(Z),this.Je=this.Je.insert(e,t)),t}rt(e){const t=this.ot(e)!==null;return t||U("WatchChangeAggregator","Detected inactive target",e),t}ot(e){const t=this.ze.get(e);return t&&t.Ne?null:this.Ge.At(e)}it(e){this.ze.set(e,new _a),this.Ge.getRemoteKeysForTarget(e).forEach((t=>{this.et(e,t,null)}))}Et(e,t){return this.Ge.getRemoteKeysForTarget(e).has(t)}}function Ar(){return new Ae(q.comparator)}function Ea(){return new Ae(q.comparator)}const Hd={asc:"ASCENDING",desc:"DESCENDING"},Kd={"<":"LESS_THAN","<=":"LESS_THAN_OR_EQUAL",">":"GREATER_THAN",">=":"GREATER_THAN_OR_EQUAL","==":"EQUAL","!=":"NOT_EQUAL","array-contains":"ARRAY_CONTAINS",in:"IN","not-in":"NOT_IN","array-contains-any":"ARRAY_CONTAINS_ANY"},Wd={and:"AND",or:"OR"};class Qd{constructor(e,t){this.databaseId=e,this.useProto3Json=t}}function Ys(n,e){return n.useProto3Json||Yr(e)?e:{value:e}}function Xs(n,e){return n.useProto3Json?`${new Date(1e3*e.seconds).toISOString().replace(/\.\d*/,"").replace("Z","")}.${("000000000"+e.nanoseconds).slice(-9)}Z`:{seconds:""+e.seconds,nanos:e.nanoseconds}}function Gl(n,e){return n.useProto3Json?e.toBase64():e.toUint8Array()}function on(n){return Ee(!!n,49232),G.fromTimestamp((function(t){const r=St(t);return new pe(r.seconds,r.nanos)})(n))}function Hl(n,e){return Js(n,e).canonicalString()}function Js(n,e){const t=(function(s){return new fe(["projects",s.projectId,"databases",s.database])})(n).child("documents");return e===void 0?t:t.child(e)}function Kl(n){const e=fe.fromString(n);return Ee(Jl(e),10190,{key:e.toString()}),e}function Ps(n,e){const t=Kl(e);if(t.get(1)!==n.databaseId.projectId)throw new j(D.INVALID_ARGUMENT,"Tried to deserialize key from different project: "+t.get(1)+" vs "+n.databaseId.projectId);if(t.get(3)!==n.databaseId.database)throw new j(D.INVALID_ARGUMENT,"Tried to deserialize key from different database: "+t.get(3)+" vs "+n.databaseId.database);return new q(Ql(t))}function Wl(n,e){return Hl(n.databaseId,e)}function Yd(n){const e=Kl(n);return e.length===4?fe.emptyPath():Ql(e)}function va(n){return new fe(["projects",n.databaseId.projectId,"databases",n.databaseId.database]).canonicalString()}function Ql(n){return Ee(n.length>4&&n.get(4)==="documents",29091,{key:n.toString()}),n.popFirst(5)}function Xd(n,e){let t;if("targetChange"in e){e.targetChange;const r=(function(d){return d==="NO_CHANGE"?0:d==="ADD"?1:d==="REMOVE"?2:d==="CURRENT"?3:d==="RESET"?4:H(39313,{state:d})})(e.targetChange.targetChangeType||"NO_CHANGE"),s=e.targetChange.targetIds||[],o=(function(d,p){return d.useProto3Json?(Ee(p===void 0||typeof p=="string",58123),Oe.fromBase64String(p||"")):(Ee(p===void 0||p instanceof Buffer||p instanceof Uint8Array,16193),Oe.fromUint8Array(p||new Uint8Array))})(n,e.targetChange.resumeToken),a=e.targetChange.cause,c=a&&(function(d){const p=d.code===void 0?D.UNKNOWN:zl(d.code);return new j(p,d.message||"")})(a);t=new ql(r,s,o,c||null)}else if("documentChange"in e){e.documentChange;const r=e.documentChange;r.document,r.document.name,r.document.updateTime;const s=Ps(n,r.document.name),o=on(r.document.updateTime),a=r.document.createTime?on(r.document.createTime):G.min(),c=new it({mapValue:{fields:r.document.fields}}),h=je.newFoundDocument(s,o,a,c),d=r.targetIds||[],p=r.removedTargetIds||[];t=new Dr(d,p,h.key,h)}else if("documentDelete"in e){e.documentDelete;const r=e.documentDelete;r.document;const s=Ps(n,r.document),o=r.readTime?on(r.readTime):G.min(),a=je.newNoDocument(s,o),c=r.removedTargetIds||[];t=new Dr([],c,a.key,a)}else if("documentRemove"in e){e.documentRemove;const r=e.documentRemove;r.document;const s=Ps(n,r.document),o=r.removedTargetIds||[];t=new Dr([],o,s,null)}else{if(!("filter"in e))return H(11601,{Rt:e});{e.filter;const r=e.filter;r.targetId;const{count:s=0,unchangedNames:o}=r,a=new zd(s,o),c=r.targetId;t=new $l(c,a)}}return t}function Jd(n,e){return{documents:[Wl(n,e.path)]}}function Zd(n,e){const t={structuredQuery:{}},r=e.path;let s;e.collectionGroup!==null?(s=r,t.structuredQuery.from=[{collectionId:e.collectionGroup,allDescendants:!0}]):(s=r.popLast(),t.structuredQuery.from=[{collectionId:r.lastSegment()}]),t.parent=Wl(n,s);const o=(function(d){if(d.length!==0)return Xl(Je.create(d,"and"))})(e.filters);o&&(t.structuredQuery.where=o);const a=(function(d){if(d.length!==0)return d.map((p=>(function(I){return{field:tn(I.field),direction:nf(I.dir)}})(p)))})(e.orderBy);a&&(t.structuredQuery.orderBy=a);const c=Ys(n,e.limit);return c!==null&&(t.structuredQuery.limit=c),e.startAt&&(t.structuredQuery.startAt=(function(d){return{before:d.inclusive,values:d.position}})(e.startAt)),e.endAt&&(t.structuredQuery.endAt=(function(d){return{before:!d.inclusive,values:d.position}})(e.endAt)),{ft:t,parent:s}}function ef(n){let e=Yd(n.parent);const t=n.structuredQuery,r=t.from?t.from.length:0;let s=null;if(r>0){Ee(r===1,65062);const p=t.from[0];p.allDescendants?s=p.collectionId:e=e.child(p.collectionId)}let o=[];t.where&&(o=(function(m){const I=Yl(m);return I instanceof Je&&Rl(I)?I.getFilters():[I]})(t.where));let a=[];t.orderBy&&(a=(function(m){return m.map((I=>(function(L){return new sr(nn(L.field),(function(F){switch(F){case"ASCENDING":return"asc";case"DESCENDING":return"desc";default:return}})(L.direction))})(I)))})(t.orderBy));let c=null;t.limit&&(c=(function(m){let I;return I=typeof m=="object"?m.value:m,Yr(I)?null:I})(t.limit));let h=null;t.startAt&&(h=(function(m){const I=!!m.before,R=m.values||[];return new jr(R,I)})(t.startAt));let d=null;return t.endAt&&(d=(function(m){const I=!m.before,R=m.values||[];return new jr(R,I)})(t.endAt)),bd(e,s,a,o,c,"F",h,d)}function tf(n,e){const t=(function(s){switch(s){case"TargetPurposeListen":return null;case"TargetPurposeExistenceFilterMismatch":return"existence-filter-mismatch";case"TargetPurposeExistenceFilterMismatchBloom":return"existence-filter-mismatch-bloom";case"TargetPurposeLimboResolution":return"limbo-document";default:return H(28987,{purpose:s})}})(e.purpose);return t==null?null:{"goog-listen-tags":t}}function Yl(n){return n.unaryFilter!==void 0?(function(t){switch(t.unaryFilter.op){case"IS_NAN":const r=nn(t.unaryFilter.field);return Ce.create(r,"==",{doubleValue:NaN});case"IS_NULL":const s=nn(t.unaryFilter.field);return Ce.create(s,"==",{nullValue:"NULL_VALUE"});case"IS_NOT_NAN":const o=nn(t.unaryFilter.field);return Ce.create(o,"!=",{doubleValue:NaN});case"IS_NOT_NULL":const a=nn(t.unaryFilter.field);return Ce.create(a,"!=",{nullValue:"NULL_VALUE"});case"OPERATOR_UNSPECIFIED":return H(61313);default:return H(60726)}})(n):n.fieldFilter!==void 0?(function(t){return Ce.create(nn(t.fieldFilter.field),(function(s){switch(s){case"EQUAL":return"==";case"NOT_EQUAL":return"!=";case"GREATER_THAN":return">";case"GREATER_THAN_OR_EQUAL":return">=";case"LESS_THAN":return"<";case"LESS_THAN_OR_EQUAL":return"<=";case"ARRAY_CONTAINS":return"array-contains";case"IN":return"in";case"NOT_IN":return"not-in";case"ARRAY_CONTAINS_ANY":return"array-contains-any";case"OPERATOR_UNSPECIFIED":return H(58110);default:return H(50506)}})(t.fieldFilter.op),t.fieldFilter.value)})(n):n.compositeFilter!==void 0?(function(t){return Je.create(t.compositeFilter.filters.map((r=>Yl(r))),(function(s){switch(s){case"AND":return"and";case"OR":return"or";default:return H(1026)}})(t.compositeFilter.op))})(n):H(30097,{filter:n})}function nf(n){return Hd[n]}function rf(n){return Kd[n]}function sf(n){return Wd[n]}function tn(n){return{fieldPath:n.canonicalString()}}function nn(n){return ze.fromServerFormat(n.fieldPath)}function Xl(n){return n instanceof Ce?(function(t){if(t.op==="=="){if(aa(t.value))return{unaryFilter:{field:tn(t.field),op:"IS_NAN"}};if(oa(t.value))return{unaryFilter:{field:tn(t.field),op:"IS_NULL"}}}else if(t.op==="!="){if(aa(t.value))return{unaryFilter:{field:tn(t.field),op:"IS_NOT_NAN"}};if(oa(t.value))return{unaryFilter:{field:tn(t.field),op:"IS_NOT_NULL"}}}return{fieldFilter:{field:tn(t.field),op:rf(t.op),value:t.value}}})(n):n instanceof Je?(function(t){const r=t.getFilters().map((s=>Xl(s)));return r.length===1?r[0]:{compositeFilter:{op:sf(t.op),filters:r}}})(n):H(54877,{filter:n})}function Jl(n){return n.length>=4&&n.get(0)==="projects"&&n.get(2)==="databases"}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Tt{constructor(e,t,r,s,o=G.min(),a=G.min(),c=Oe.EMPTY_BYTE_STRING,h=null){this.target=e,this.targetId=t,this.purpose=r,this.sequenceNumber=s,this.snapshotVersion=o,this.lastLimboFreeSnapshotVersion=a,this.resumeToken=c,this.expectedCount=h}withSequenceNumber(e){return new Tt(this.target,this.targetId,this.purpose,e,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,this.expectedCount)}withResumeToken(e,t){return new Tt(this.target,this.targetId,this.purpose,this.sequenceNumber,t,this.lastLimboFreeSnapshotVersion,e,null)}withExpectedCount(e){return new Tt(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,this.lastLimboFreeSnapshotVersion,this.resumeToken,e)}withLastLimboFreeSnapshotVersion(e){return new Tt(this.target,this.targetId,this.purpose,this.sequenceNumber,this.snapshotVersion,e,this.resumeToken,this.expectedCount)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class of{constructor(e){this.yt=e}}function af(n){const e=ef({parent:n.parent,structuredQuery:n.structuredQuery});return n.limitType==="LAST"?Ks(e,e.limit,"L"):e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class lf{constructor(){this.Cn=new cf}addToCollectionParentIndex(e,t){return this.Cn.add(t),P.resolve()}getCollectionParents(e,t){return P.resolve(this.Cn.getEntries(t))}addFieldIndex(e,t){return P.resolve()}deleteFieldIndex(e,t){return P.resolve()}deleteAllFieldIndexes(e){return P.resolve()}createTargetIndexes(e,t){return P.resolve()}getDocumentsMatchingTarget(e,t){return P.resolve(null)}getIndexType(e,t){return P.resolve(0)}getFieldIndexes(e,t){return P.resolve([])}getNextCollectionGroupToUpdate(e){return P.resolve(null)}getMinOffset(e,t){return P.resolve(At.min())}getMinOffsetFromCollectionGroup(e,t){return P.resolve(At.min())}updateCollectionGroup(e,t,r){return P.resolve()}updateIndexEntries(e,t){return P.resolve()}}class cf{constructor(){this.index={}}add(e){const t=e.lastSegment(),r=e.popLast(),s=this.index[t]||new De(fe.comparator),o=!s.has(r);return this.index[t]=s.add(r),o}has(e){const t=e.lastSegment(),r=e.popLast(),s=this.index[t];return s&&s.has(r)}getEntries(e){return(this.index[e]||new De(fe.comparator)).toArray()}}/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ta={didRun:!1,sequenceNumbersCollected:0,targetsRemoved:0,documentsRemoved:0},Zl=41943040;class He{static withCacheSize(e){return new He(e,He.DEFAULT_COLLECTION_PERCENTILE,He.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT)}constructor(e,t,r){this.cacheSizeCollectionThreshold=e,this.percentileToCollect=t,this.maximumSequenceNumbersToCollect=r}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */He.DEFAULT_COLLECTION_PERCENTILE=10,He.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT=1e3,He.DEFAULT=new He(Zl,He.DEFAULT_COLLECTION_PERCENTILE,He.DEFAULT_MAX_SEQUENCE_NUMBERS_TO_COLLECT),He.DISABLED=new He(-1,0,0);/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class pn{constructor(e){this.ar=e}next(){return this.ar+=2,this.ar}static ur(){return new pn(0)}static cr(){return new pn(-1)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const wa="LruGarbageCollector",uf=1048576;function Ia([n,e],[t,r]){const s=Z(n,t);return s===0?Z(e,r):s}class hf{constructor(e){this.Ir=e,this.buffer=new De(Ia),this.Er=0}dr(){return++this.Er}Ar(e){const t=[e,this.dr()];if(this.buffer.size<this.Ir)this.buffer=this.buffer.add(t);else{const r=this.buffer.last();Ia(t,r)<0&&(this.buffer=this.buffer.delete(r).add(t))}}get maxValue(){return this.buffer.last()[0]}}class df{constructor(e,t,r){this.garbageCollector=e,this.asyncQueue=t,this.localStore=r,this.Rr=null}start(){this.garbageCollector.params.cacheSizeCollectionThreshold!==-1&&this.Vr(6e4)}stop(){this.Rr&&(this.Rr.cancel(),this.Rr=null)}get started(){return this.Rr!==null}Vr(e){U(wa,`Garbage collection scheduled in ${e}ms`),this.Rr=this.asyncQueue.enqueueAfterDelay("lru_garbage_collection",e,(async()=>{this.Rr=null;try{await this.localStore.collectGarbage(this.garbageCollector)}catch(t){En(t)?U(wa,"Ignoring IndexedDB error during garbage collection: ",t):await Wr(t)}await this.Vr(3e5)}))}}class ff{constructor(e,t){this.mr=e,this.params=t}calculateTargetCount(e,t){return this.mr.gr(e).next((r=>Math.floor(t/100*r)))}nthSequenceNumber(e,t){if(t===0)return P.resolve(Qr.ce);const r=new hf(t);return this.mr.forEachTarget(e,(s=>r.Ar(s.sequenceNumber))).next((()=>this.mr.pr(e,(s=>r.Ar(s))))).next((()=>r.maxValue))}removeTargets(e,t,r){return this.mr.removeTargets(e,t,r)}removeOrphanedDocuments(e,t){return this.mr.removeOrphanedDocuments(e,t)}collect(e,t){return this.params.cacheSizeCollectionThreshold===-1?(U("LruGarbageCollector","Garbage collection skipped; disabled"),P.resolve(Ta)):this.getCacheSize(e).next((r=>r<this.params.cacheSizeCollectionThreshold?(U("LruGarbageCollector",`Garbage collection skipped; Cache size ${r} is lower than threshold ${this.params.cacheSizeCollectionThreshold}`),Ta):this.yr(e,t)))}getCacheSize(e){return this.mr.getCacheSize(e)}yr(e,t){let r,s,o,a,c,h,d;const p=Date.now();return this.calculateTargetCount(e,this.params.percentileToCollect).next((m=>(m>this.params.maximumSequenceNumbersToCollect?(U("LruGarbageCollector",`Capping sequence numbers to collect down to the maximum of ${this.params.maximumSequenceNumbersToCollect} from ${m}`),s=this.params.maximumSequenceNumbersToCollect):s=m,a=Date.now(),this.nthSequenceNumber(e,s)))).next((m=>(r=m,c=Date.now(),this.removeTargets(e,r,t)))).next((m=>(o=m,h=Date.now(),this.removeOrphanedDocuments(e,r)))).next((m=>(d=Date.now(),Zt()<=te.DEBUG&&U("LruGarbageCollector",`LRU Garbage Collection
	Counted targets in ${a-p}ms
	Determined least recently used ${s} in `+(c-a)+`ms
	Removed ${o} targets in `+(h-c)+`ms
	Removed ${m} documents in `+(d-h)+`ms
Total Duration: ${d-p}ms`),P.resolve({didRun:!0,sequenceNumbersCollected:s,targetsRemoved:o,documentsRemoved:m}))))}}function pf(n,e){return new ff(n,e)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class mf{constructor(){this.changes=new $t((e=>e.toString()),((e,t)=>e.isEqual(t))),this.changesApplied=!1}addEntry(e){this.assertNotApplied(),this.changes.set(e.key,e)}removeEntry(e,t){this.assertNotApplied(),this.changes.set(e,je.newInvalidDocument(e).setReadTime(t))}getEntry(e,t){this.assertNotApplied();const r=this.changes.get(t);return r!==void 0?P.resolve(r):this.getFromCache(e,t)}getEntries(e,t){return this.getAllFromCache(e,t)}apply(e){return this.assertNotApplied(),this.changesApplied=!0,this.applyChanges(e)}assertNotApplied(){}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *//**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class gf{constructor(e,t){this.overlayedDocument=e,this.mutatedFields=t}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class yf{constructor(e,t,r,s){this.remoteDocumentCache=e,this.mutationQueue=t,this.documentOverlayCache=r,this.indexManager=s}getDocument(e,t){let r=null;return this.documentOverlayCache.getOverlay(e,t).next((s=>(r=s,this.remoteDocumentCache.getEntry(e,t)))).next((s=>(r!==null&&Yn(r.mutation,s,vt.empty(),pe.now()),s)))}getDocuments(e,t){return this.remoteDocumentCache.getEntries(e,t).next((r=>this.getLocalViewOfDocuments(e,r,se()).next((()=>r))))}getLocalViewOfDocuments(e,t,r=se()){const s=Ut();return this.populateOverlays(e,s,t).next((()=>this.computeViews(e,t,s,r).next((o=>{let a=$n();return o.forEach(((c,h)=>{a=a.insert(c,h.overlayedDocument)})),a}))))}getOverlayedDocuments(e,t){const r=Ut();return this.populateOverlays(e,r,t).next((()=>this.computeViews(e,t,r,se())))}populateOverlays(e,t,r){const s=[];return r.forEach((o=>{t.has(o)||s.push(o)})),this.documentOverlayCache.getOverlays(e,s).next((o=>{o.forEach(((a,c)=>{t.set(a,c)}))}))}computeViews(e,t,r,s){let o=Pt();const a=Qn(),c=(function(){return Qn()})();return t.forEach(((h,d)=>{const p=r.get(d.key);s.has(d.key)&&(p===void 0||p.mutation instanceof ts)?o=o.insert(d.key,d):p!==void 0?(a.set(d.key,p.mutation.getFieldMask()),Yn(p.mutation,d,p.mutation.getFieldMask(),pe.now())):a.set(d.key,vt.empty())})),this.recalculateAndSaveOverlays(e,o).next((h=>(h.forEach(((d,p)=>a.set(d,p))),t.forEach(((d,p)=>c.set(d,new gf(p,a.get(d)??null)))),c)))}recalculateAndSaveOverlays(e,t){const r=Qn();let s=new Ae(((a,c)=>a-c)),o=se();return this.mutationQueue.getAllMutationBatchesAffectingDocumentKeys(e,t).next((a=>{for(const c of a)c.keys().forEach((h=>{const d=t.get(h);if(d===null)return;let p=r.get(h)||vt.empty();p=c.applyToLocalView(d,p),r.set(h,p);const m=(s.get(c.batchId)||se()).add(h);s=s.insert(c.batchId,m)}))})).next((()=>{const a=[],c=s.getReverseIterator();for(;c.hasNext();){const h=c.getNext(),d=h.key,p=h.value,m=Fl();p.forEach((I=>{if(!o.has(I)){const R=Bl(t.get(I),r.get(I));R!==null&&m.set(I,R),o=o.add(I)}})),a.push(this.documentOverlayCache.saveOverlays(e,d,m))}return P.waitFor(a)})).next((()=>r))}recalculateAndSaveOverlaysForDocumentKeys(e,t){return this.remoteDocumentCache.getEntries(e,t).next((r=>this.recalculateAndSaveOverlays(e,r)))}getDocumentsMatchingQuery(e,t,r,s){return(function(a){return q.isDocumentKey(a.path)&&a.collectionGroup===null&&a.filters.length===0})(t)?this.getDocumentsMatchingDocumentQuery(e,t.path):Vl(t)?this.getDocumentsMatchingCollectionGroupQuery(e,t,r,s):this.getDocumentsMatchingCollectionQuery(e,t,r,s)}getNextDocuments(e,t,r,s){return this.remoteDocumentCache.getAllFromCollectionGroup(e,t,r,s).next((o=>{const a=s-o.size>0?this.documentOverlayCache.getOverlaysForCollectionGroup(e,t,r.largestBatchId,s-o.size):P.resolve(Ut());let c=er,h=o;return a.next((d=>P.forEach(d,((p,m)=>(c<m.largestBatchId&&(c=m.largestBatchId),o.get(p)?P.resolve():this.remoteDocumentCache.getEntry(e,p).next((I=>{h=h.insert(p,I)}))))).next((()=>this.populateOverlays(e,d,o))).next((()=>this.computeViews(e,h,d,se()))).next((p=>({batchId:c,changes:Pd(p)})))))}))}getDocumentsMatchingDocumentQuery(e,t){return this.getDocument(e,new q(t)).next((r=>{let s=$n();return r.isFoundDocument()&&(s=s.insert(r.key,r)),s}))}getDocumentsMatchingCollectionGroupQuery(e,t,r,s){const o=t.collectionGroup;let a=$n();return this.indexManager.getCollectionParents(e,o).next((c=>P.forEach(c,(h=>{const d=(function(m,I){return new Tn(I,null,m.explicitOrderBy.slice(),m.filters.slice(),m.limit,m.limitType,m.startAt,m.endAt)})(t,h.child(o));return this.getDocumentsMatchingCollectionQuery(e,d,r,s).next((p=>{p.forEach(((m,I)=>{a=a.insert(m,I)}))}))})).next((()=>a))))}getDocumentsMatchingCollectionQuery(e,t,r,s){let o;return this.documentOverlayCache.getOverlaysForCollection(e,t.path,r.largestBatchId).next((a=>(o=a,this.remoteDocumentCache.getDocumentsMatchingQuery(e,t,r,o,s)))).next((a=>{o.forEach(((h,d)=>{const p=d.getKey();a.get(p)===null&&(a=a.insert(p,je.newInvalidDocument(p)))}));let c=$n();return a.forEach(((h,d)=>{const p=o.get(h);p!==void 0&&Yn(p.mutation,d,vt.empty(),pe.now()),Zr(t,d)&&(c=c.insert(h,d))})),c}))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class _f{constructor(e){this.serializer=e,this.Lr=new Map,this.kr=new Map}getBundleMetadata(e,t){return P.resolve(this.Lr.get(t))}saveBundleMetadata(e,t){return this.Lr.set(t.id,(function(s){return{id:s.id,version:s.version,createTime:on(s.createTime)}})(t)),P.resolve()}getNamedQuery(e,t){return P.resolve(this.kr.get(t))}saveNamedQuery(e,t){return this.kr.set(t.name,(function(s){return{name:s.name,query:af(s.bundledQuery),readTime:on(s.readTime)}})(t)),P.resolve()}}/**
 * @license
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ef{constructor(){this.overlays=new Ae(q.comparator),this.qr=new Map}getOverlay(e,t){return P.resolve(this.overlays.get(t))}getOverlays(e,t){const r=Ut();return P.forEach(t,(s=>this.getOverlay(e,s).next((o=>{o!==null&&r.set(s,o)})))).next((()=>r))}saveOverlays(e,t,r){return r.forEach(((s,o)=>{this.St(e,t,o)})),P.resolve()}removeOverlaysForBatchId(e,t,r){const s=this.qr.get(r);return s!==void 0&&(s.forEach((o=>this.overlays=this.overlays.remove(o))),this.qr.delete(r)),P.resolve()}getOverlaysForCollection(e,t,r){const s=Ut(),o=t.length+1,a=new q(t.child("")),c=this.overlays.getIteratorFrom(a);for(;c.hasNext();){const h=c.getNext().value,d=h.getKey();if(!t.isPrefixOf(d.path))break;d.path.length===o&&h.largestBatchId>r&&s.set(h.getKey(),h)}return P.resolve(s)}getOverlaysForCollectionGroup(e,t,r,s){let o=new Ae(((d,p)=>d-p));const a=this.overlays.getIterator();for(;a.hasNext();){const d=a.getNext().value;if(d.getKey().getCollectionGroup()===t&&d.largestBatchId>r){let p=o.get(d.largestBatchId);p===null&&(p=Ut(),o=o.insert(d.largestBatchId,p)),p.set(d.getKey(),d)}}const c=Ut(),h=o.getIterator();for(;h.hasNext()&&(h.getNext().value.forEach(((d,p)=>c.set(d,p))),!(c.size()>=s)););return P.resolve(c)}St(e,t,r){const s=this.overlays.get(r.key);if(s!==null){const a=this.qr.get(s.largestBatchId).delete(r.key);this.qr.set(s.largestBatchId,a)}this.overlays=this.overlays.insert(r.key,new jd(t,r));let o=this.qr.get(t);o===void 0&&(o=se(),this.qr.set(t,o)),this.qr.set(t,o.add(r.key))}}/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class vf{constructor(){this.sessionToken=Oe.EMPTY_BYTE_STRING}getSessionToken(e){return P.resolve(this.sessionToken)}setSessionToken(e,t){return this.sessionToken=t,P.resolve()}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ti{constructor(){this.Qr=new De(Fe.$r),this.Ur=new De(Fe.Kr)}isEmpty(){return this.Qr.isEmpty()}addReference(e,t){const r=new Fe(e,t);this.Qr=this.Qr.add(r),this.Ur=this.Ur.add(r)}Wr(e,t){e.forEach((r=>this.addReference(r,t)))}removeReference(e,t){this.Gr(new Fe(e,t))}zr(e,t){e.forEach((r=>this.removeReference(r,t)))}jr(e){const t=new q(new fe([])),r=new Fe(t,e),s=new Fe(t,e+1),o=[];return this.Ur.forEachInRange([r,s],(a=>{this.Gr(a),o.push(a.key)})),o}Jr(){this.Qr.forEach((e=>this.Gr(e)))}Gr(e){this.Qr=this.Qr.delete(e),this.Ur=this.Ur.delete(e)}Hr(e){const t=new q(new fe([])),r=new Fe(t,e),s=new Fe(t,e+1);let o=se();return this.Ur.forEachInRange([r,s],(a=>{o=o.add(a.key)})),o}containsKey(e){const t=new Fe(e,0),r=this.Qr.firstAfterOrEqual(t);return r!==null&&e.isEqual(r.key)}}class Fe{constructor(e,t){this.key=e,this.Yr=t}static $r(e,t){return q.comparator(e.key,t.key)||Z(e.Yr,t.Yr)}static Kr(e,t){return Z(e.Yr,t.Yr)||q.comparator(e.key,t.key)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Tf{constructor(e,t){this.indexManager=e,this.referenceDelegate=t,this.mutationQueue=[],this.tr=1,this.Zr=new De(Fe.$r)}checkEmpty(e){return P.resolve(this.mutationQueue.length===0)}addMutationBatch(e,t,r,s){const o=this.tr;this.tr++,this.mutationQueue.length>0&&this.mutationQueue[this.mutationQueue.length-1];const a=new Bd(o,t,r,s);this.mutationQueue.push(a);for(const c of s)this.Zr=this.Zr.add(new Fe(c.key,o)),this.indexManager.addToCollectionParentIndex(e,c.key.path.popLast());return P.resolve(a)}lookupMutationBatch(e,t){return P.resolve(this.Xr(t))}getNextMutationBatchAfterBatchId(e,t){const r=t+1,s=this.ei(r),o=s<0?0:s;return P.resolve(this.mutationQueue.length>o?this.mutationQueue[o]:null)}getHighestUnacknowledgedBatchId(){return P.resolve(this.mutationQueue.length===0?id:this.tr-1)}getAllMutationBatches(e){return P.resolve(this.mutationQueue.slice())}getAllMutationBatchesAffectingDocumentKey(e,t){const r=new Fe(t,0),s=new Fe(t,Number.POSITIVE_INFINITY),o=[];return this.Zr.forEachInRange([r,s],(a=>{const c=this.Xr(a.Yr);o.push(c)})),P.resolve(o)}getAllMutationBatchesAffectingDocumentKeys(e,t){let r=new De(Z);return t.forEach((s=>{const o=new Fe(s,0),a=new Fe(s,Number.POSITIVE_INFINITY);this.Zr.forEachInRange([o,a],(c=>{r=r.add(c.Yr)}))})),P.resolve(this.ti(r))}getAllMutationBatchesAffectingQuery(e,t){const r=t.path,s=r.length+1;let o=r;q.isDocumentKey(o)||(o=o.child(""));const a=new Fe(new q(o),0);let c=new De(Z);return this.Zr.forEachWhile((h=>{const d=h.key.path;return!!r.isPrefixOf(d)&&(d.length===s&&(c=c.add(h.Yr)),!0)}),a),P.resolve(this.ti(c))}ti(e){const t=[];return e.forEach((r=>{const s=this.Xr(r);s!==null&&t.push(s)})),t}removeMutationBatch(e,t){Ee(this.ni(t.batchId,"removed")===0,55003),this.mutationQueue.shift();let r=this.Zr;return P.forEach(t.mutations,(s=>{const o=new Fe(s.key,t.batchId);return r=r.delete(o),this.referenceDelegate.markPotentiallyOrphaned(e,s.key)})).next((()=>{this.Zr=r}))}ir(e){}containsKey(e,t){const r=new Fe(t,0),s=this.Zr.firstAfterOrEqual(r);return P.resolve(t.isEqual(s&&s.key))}performConsistencyCheck(e){return this.mutationQueue.length,P.resolve()}ni(e,t){return this.ei(e)}ei(e){return this.mutationQueue.length===0?0:e-this.mutationQueue[0].batchId}Xr(e){const t=this.ei(e);return t<0||t>=this.mutationQueue.length?null:this.mutationQueue[t]}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class wf{constructor(e){this.ri=e,this.docs=(function(){return new Ae(q.comparator)})(),this.size=0}setIndexManager(e){this.indexManager=e}addEntry(e,t){const r=t.key,s=this.docs.get(r),o=s?s.size:0,a=this.ri(t);return this.docs=this.docs.insert(r,{document:t.mutableCopy(),size:a}),this.size+=a-o,this.indexManager.addToCollectionParentIndex(e,r.path.popLast())}removeEntry(e){const t=this.docs.get(e);t&&(this.docs=this.docs.remove(e),this.size-=t.size)}getEntry(e,t){const r=this.docs.get(t);return P.resolve(r?r.document.mutableCopy():je.newInvalidDocument(t))}getEntries(e,t){let r=Pt();return t.forEach((s=>{const o=this.docs.get(s);r=r.insert(s,o?o.document.mutableCopy():je.newInvalidDocument(s))})),P.resolve(r)}getDocumentsMatchingQuery(e,t,r,s){let o=Pt();const a=t.path,c=new q(a.child("__id-9223372036854775808__")),h=this.docs.getIteratorFrom(c);for(;h.hasNext();){const{key:d,value:{document:p}}=h.getNext();if(!a.isPrefixOf(d.path))break;d.path.length>a.length+1||td(ed(p),r)<=0||(s.has(p.key)||Zr(t,p))&&(o=o.insert(p.key,p.mutableCopy()))}return P.resolve(o)}getAllFromCollectionGroup(e,t,r,s){H(9500)}ii(e,t){return P.forEach(this.docs,(r=>t(r)))}newChangeBuffer(e){return new If(this)}getSize(e){return P.resolve(this.size)}}class If extends mf{constructor(e){super(),this.Nr=e}applyChanges(e){const t=[];return this.changes.forEach(((r,s)=>{s.isValidDocument()?t.push(this.Nr.addEntry(e,s)):this.Nr.removeEntry(r)})),P.waitFor(t)}getFromCache(e,t){return this.Nr.getEntry(e,t)}getAllFromCache(e,t){return this.Nr.getEntries(e,t)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class bf{constructor(e){this.persistence=e,this.si=new $t((t=>pi(t)),mi),this.lastRemoteSnapshotVersion=G.min(),this.highestTargetId=0,this.oi=0,this._i=new Ti,this.targetCount=0,this.ai=pn.ur()}forEachTarget(e,t){return this.si.forEach(((r,s)=>t(s))),P.resolve()}getLastRemoteSnapshotVersion(e){return P.resolve(this.lastRemoteSnapshotVersion)}getHighestSequenceNumber(e){return P.resolve(this.oi)}allocateTargetId(e){return this.highestTargetId=this.ai.next(),P.resolve(this.highestTargetId)}setTargetsMetadata(e,t,r){return r&&(this.lastRemoteSnapshotVersion=r),t>this.oi&&(this.oi=t),P.resolve()}Pr(e){this.si.set(e.target,e);const t=e.targetId;t>this.highestTargetId&&(this.ai=new pn(t),this.highestTargetId=t),e.sequenceNumber>this.oi&&(this.oi=e.sequenceNumber)}addTargetData(e,t){return this.Pr(t),this.targetCount+=1,P.resolve()}updateTargetData(e,t){return this.Pr(t),P.resolve()}removeTargetData(e,t){return this.si.delete(t.target),this._i.jr(t.targetId),this.targetCount-=1,P.resolve()}removeTargets(e,t,r){let s=0;const o=[];return this.si.forEach(((a,c)=>{c.sequenceNumber<=t&&r.get(c.targetId)===null&&(this.si.delete(a),o.push(this.removeMatchingKeysForTargetId(e,c.targetId)),s++)})),P.waitFor(o).next((()=>s))}getTargetCount(e){return P.resolve(this.targetCount)}getTargetData(e,t){const r=this.si.get(t)||null;return P.resolve(r)}addMatchingKeys(e,t,r){return this._i.Wr(t,r),P.resolve()}removeMatchingKeys(e,t,r){this._i.zr(t,r);const s=this.persistence.referenceDelegate,o=[];return s&&t.forEach((a=>{o.push(s.markPotentiallyOrphaned(e,a))})),P.waitFor(o)}removeMatchingKeysForTargetId(e,t){return this._i.jr(t),P.resolve()}getMatchingKeysForTargetId(e,t){const r=this._i.Hr(t);return P.resolve(r)}containsKey(e,t){return P.resolve(this._i.containsKey(t))}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class ec{constructor(e,t){this.ui={},this.overlays={},this.ci=new Qr(0),this.li=!1,this.li=!0,this.hi=new vf,this.referenceDelegate=e(this),this.Pi=new bf(this),this.indexManager=new lf,this.remoteDocumentCache=(function(s){return new wf(s)})((r=>this.referenceDelegate.Ti(r))),this.serializer=new of(t),this.Ii=new _f(this.serializer)}start(){return Promise.resolve()}shutdown(){return this.li=!1,Promise.resolve()}get started(){return this.li}setDatabaseDeletedListener(){}setNetworkEnabled(){}getIndexManager(e){return this.indexManager}getDocumentOverlayCache(e){let t=this.overlays[e.toKey()];return t||(t=new Ef,this.overlays[e.toKey()]=t),t}getMutationQueue(e,t){let r=this.ui[e.toKey()];return r||(r=new Tf(t,this.referenceDelegate),this.ui[e.toKey()]=r),r}getGlobalsCache(){return this.hi}getTargetCache(){return this.Pi}getRemoteDocumentCache(){return this.remoteDocumentCache}getBundleCache(){return this.Ii}runTransaction(e,t,r){U("MemoryPersistence","Starting transaction:",e);const s=new Af(this.ci.next());return this.referenceDelegate.Ei(),r(s).next((o=>this.referenceDelegate.di(s).next((()=>o)))).toPromise().then((o=>(s.raiseOnCommittedEvent(),o)))}Ai(e,t){return P.or(Object.values(this.ui).map((r=>()=>r.containsKey(e,t))))}}class Af extends rd{constructor(e){super(),this.currentSequenceNumber=e}}class wi{constructor(e){this.persistence=e,this.Ri=new Ti,this.Vi=null}static mi(e){return new wi(e)}get fi(){if(this.Vi)return this.Vi;throw H(60996)}addReference(e,t,r){return this.Ri.addReference(r,t),this.fi.delete(r.toString()),P.resolve()}removeReference(e,t,r){return this.Ri.removeReference(r,t),this.fi.add(r.toString()),P.resolve()}markPotentiallyOrphaned(e,t){return this.fi.add(t.toString()),P.resolve()}removeTarget(e,t){this.Ri.jr(t.targetId).forEach((s=>this.fi.add(s.toString())));const r=this.persistence.getTargetCache();return r.getMatchingKeysForTargetId(e,t.targetId).next((s=>{s.forEach((o=>this.fi.add(o.toString())))})).next((()=>r.removeTargetData(e,t)))}Ei(){this.Vi=new Set}di(e){const t=this.persistence.getRemoteDocumentCache().newChangeBuffer();return P.forEach(this.fi,(r=>{const s=q.fromPath(r);return this.gi(e,s).next((o=>{o||t.removeEntry(s,G.min())}))})).next((()=>(this.Vi=null,t.apply(e))))}updateLimboDocument(e,t){return this.gi(e,t).next((r=>{r?this.fi.delete(t.toString()):this.fi.add(t.toString())}))}Ti(e){return 0}gi(e,t){return P.or([()=>P.resolve(this.Ri.containsKey(t)),()=>this.persistence.getTargetCache().containsKey(e,t),()=>this.persistence.Ai(e,t)])}}class qr{constructor(e,t){this.persistence=e,this.pi=new $t((r=>ad(r.path)),((r,s)=>r.isEqual(s))),this.garbageCollector=pf(this,t)}static mi(e,t){return new qr(e,t)}Ei(){}di(e){return P.resolve()}forEachTarget(e,t){return this.persistence.getTargetCache().forEachTarget(e,t)}gr(e){const t=this.wr(e);return this.persistence.getTargetCache().getTargetCount(e).next((r=>t.next((s=>r+s))))}wr(e){let t=0;return this.pr(e,(r=>{t++})).next((()=>t))}pr(e,t){return P.forEach(this.pi,((r,s)=>this.br(e,r,s).next((o=>o?P.resolve():t(s)))))}removeTargets(e,t,r){return this.persistence.getTargetCache().removeTargets(e,t,r)}removeOrphanedDocuments(e,t){let r=0;const s=this.persistence.getRemoteDocumentCache(),o=s.newChangeBuffer();return s.ii(e,(a=>this.br(e,a,t).next((c=>{c||(r++,o.removeEntry(a,G.min()))})))).next((()=>o.apply(e))).next((()=>r))}markPotentiallyOrphaned(e,t){return this.pi.set(t,e.currentSequenceNumber),P.resolve()}removeTarget(e,t){const r=t.withSequenceNumber(e.currentSequenceNumber);return this.persistence.getTargetCache().updateTargetData(e,r)}addReference(e,t,r){return this.pi.set(r,e.currentSequenceNumber),P.resolve()}removeReference(e,t,r){return this.pi.set(r,e.currentSequenceNumber),P.resolve()}updateLimboDocument(e,t){return this.pi.set(t,e.currentSequenceNumber),P.resolve()}Ti(e){let t=e.key.toString().length;return e.isFoundDocument()&&(t+=xr(e.data.value)),t}br(e,t,r){return P.or([()=>this.persistence.Ai(e,t),()=>this.persistence.getTargetCache().containsKey(e,t),()=>{const s=this.pi.get(t);return P.resolve(s!==void 0&&s>r)}])}getCacheSize(e){return this.persistence.getRemoteDocumentCache().getSize(e)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ii{constructor(e,t,r,s){this.targetId=e,this.fromCache=t,this.Es=r,this.ds=s}static As(e,t){let r=se(),s=se();for(const o of t.docChanges)switch(o.type){case 0:r=r.add(o.doc.key);break;case 1:s=s.add(o.doc.key)}return new Ii(e,t.fromCache,r,s)}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Sf{constructor(){this._documentReadCount=0}get documentReadCount(){return this._documentReadCount}incrementDocumentReadCount(e){this._documentReadCount+=e}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Rf{constructor(){this.Rs=!1,this.Vs=!1,this.fs=100,this.gs=(function(){return wu()?8:sd(vu())>0?6:4})()}initialize(e,t){this.ps=e,this.indexManager=t,this.Rs=!0}getDocumentsMatchingQuery(e,t,r,s){const o={result:null};return this.ys(e,t).next((a=>{o.result=a})).next((()=>{if(!o.result)return this.ws(e,t,s,r).next((a=>{o.result=a}))})).next((()=>{if(o.result)return;const a=new Sf;return this.Ss(e,t,a).next((c=>{if(o.result=c,this.Vs)return this.bs(e,t,a,c.size)}))})).next((()=>o.result))}bs(e,t,r,s){return r.documentReadCount<this.fs?(Zt()<=te.DEBUG&&U("QueryEngine","SDK will not create cache indexes for query:",en(t),"since it only creates cache indexes for collection contains","more than or equal to",this.fs,"documents"),P.resolve()):(Zt()<=te.DEBUG&&U("QueryEngine","Query:",en(t),"scans",r.documentReadCount,"local documents and returns",s,"documents as results."),r.documentReadCount>this.gs*s?(Zt()<=te.DEBUG&&U("QueryEngine","The SDK decides to create cache indexes for query:",en(t),"as using cache indexes may help improve performance."),this.indexManager.createTargetIndexes(e,ot(t))):P.resolve())}ys(e,t){if(ha(t))return P.resolve(null);let r=ot(t);return this.indexManager.getIndexType(e,r).next((s=>s===0?null:(t.limit!==null&&s===1&&(t=Ks(t,null,"F"),r=ot(t)),this.indexManager.getDocumentsMatchingTarget(e,r).next((o=>{const a=se(...o);return this.ps.getDocuments(e,a).next((c=>this.indexManager.getMinOffset(e,r).next((h=>{const d=this.Ds(t,c);return this.Cs(t,d,a,h.readTime)?this.ys(e,Ks(t,null,"F")):this.vs(e,d,t,h)}))))})))))}ws(e,t,r,s){return ha(t)||s.isEqual(G.min())?P.resolve(null):this.ps.getDocuments(e,r).next((o=>{const a=this.Ds(t,o);return this.Cs(t,a,r,s)?P.resolve(null):(Zt()<=te.DEBUG&&U("QueryEngine","Re-using previous result from %s to execute query: %s",s.toString(),en(t)),this.vs(e,a,t,Zh(s,er)).next((c=>c)))}))}Ds(e,t){let r=new De(kl(e));return t.forEach(((s,o)=>{Zr(e,o)&&(r=r.add(o))})),r}Cs(e,t,r,s){if(e.limit===null)return!1;if(r.size!==t.size)return!0;const o=e.limitType==="F"?t.last():t.first();return!!o&&(o.hasPendingWrites||o.version.compareTo(s)>0)}Ss(e,t,r){return Zt()<=te.DEBUG&&U("QueryEngine","Using full collection scan to execute query:",en(t)),this.ps.getDocumentsMatchingQuery(e,t,At.min(),r)}vs(e,t,r,s){return this.ps.getDocumentsMatchingQuery(e,r,s).next((o=>(t.forEach((a=>{o=o.insert(a.key,a)})),o)))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const bi="LocalStore",Cf=3e8;class Pf{constructor(e,t,r,s){this.persistence=e,this.Fs=t,this.serializer=s,this.Ms=new Ae(Z),this.xs=new $t((o=>pi(o)),mi),this.Os=new Map,this.Ns=e.getRemoteDocumentCache(),this.Pi=e.getTargetCache(),this.Ii=e.getBundleCache(),this.Bs(r)}Bs(e){this.documentOverlayCache=this.persistence.getDocumentOverlayCache(e),this.indexManager=this.persistence.getIndexManager(e),this.mutationQueue=this.persistence.getMutationQueue(e,this.indexManager),this.localDocuments=new yf(this.Ns,this.mutationQueue,this.documentOverlayCache,this.indexManager),this.Ns.setIndexManager(this.indexManager),this.Fs.initialize(this.localDocuments,this.indexManager)}collectGarbage(e){return this.persistence.runTransaction("Collect garbage","readwrite-primary",(t=>e.collect(t,this.Ms)))}}function xf(n,e,t,r){return new Pf(n,e,t,r)}async function tc(n,e){const t=ne(n);return await t.persistence.runTransaction("Handle user change","readonly",(r=>{let s;return t.mutationQueue.getAllMutationBatches(r).next((o=>(s=o,t.Bs(e),t.mutationQueue.getAllMutationBatches(r)))).next((o=>{const a=[],c=[];let h=se();for(const d of s){a.push(d.batchId);for(const p of d.mutations)h=h.add(p.key)}for(const d of o){c.push(d.batchId);for(const p of d.mutations)h=h.add(p.key)}return t.localDocuments.getDocuments(r,h).next((d=>({Ls:d,removedBatchIds:a,addedBatchIds:c})))}))}))}function nc(n){const e=ne(n);return e.persistence.runTransaction("Get last remote snapshot version","readonly",(t=>e.Pi.getLastRemoteSnapshotVersion(t)))}function Vf(n,e){const t=ne(n),r=e.snapshotVersion;let s=t.Ms;return t.persistence.runTransaction("Apply remote event","readwrite-primary",(o=>{const a=t.Ns.newChangeBuffer({trackRemovals:!0});s=t.Ms;const c=[];e.targetChanges.forEach(((p,m)=>{const I=s.get(m);if(!I)return;c.push(t.Pi.removeMatchingKeys(o,p.removedDocuments,m).next((()=>t.Pi.addMatchingKeys(o,p.addedDocuments,m))));let R=I.withSequenceNumber(o.currentSequenceNumber);e.targetMismatches.get(m)!==null?R=R.withResumeToken(Oe.EMPTY_BYTE_STRING,G.min()).withLastLimboFreeSnapshotVersion(G.min()):p.resumeToken.approximateByteSize()>0&&(R=R.withResumeToken(p.resumeToken,r)),s=s.insert(m,R),(function(z,F,X){return z.resumeToken.approximateByteSize()===0||F.snapshotVersion.toMicroseconds()-z.snapshotVersion.toMicroseconds()>=Cf?!0:X.addedDocuments.size+X.modifiedDocuments.size+X.removedDocuments.size>0})(I,R,p)&&c.push(t.Pi.updateTargetData(o,R))}));let h=Pt(),d=se();if(e.documentUpdates.forEach((p=>{e.resolvedLimboDocuments.has(p)&&c.push(t.persistence.referenceDelegate.updateLimboDocument(o,p))})),c.push(Df(o,a,e.documentUpdates).next((p=>{h=p.ks,d=p.qs}))),!r.isEqual(G.min())){const p=t.Pi.getLastRemoteSnapshotVersion(o).next((m=>t.Pi.setTargetsMetadata(o,o.currentSequenceNumber,r)));c.push(p)}return P.waitFor(c).next((()=>a.apply(o))).next((()=>t.localDocuments.getLocalViewOfDocuments(o,h,d))).next((()=>h))})).then((o=>(t.Ms=s,o)))}function Df(n,e,t){let r=se(),s=se();return t.forEach((o=>r=r.add(o))),e.getEntries(n,r).next((o=>{let a=Pt();return t.forEach(((c,h)=>{const d=o.get(c);h.isFoundDocument()!==d.isFoundDocument()&&(s=s.add(c)),h.isNoDocument()&&h.version.isEqual(G.min())?(e.removeEntry(c,h.readTime),a=a.insert(c,h)):!d.isValidDocument()||h.version.compareTo(d.version)>0||h.version.compareTo(d.version)===0&&d.hasPendingWrites?(e.addEntry(h),a=a.insert(c,h)):U(bi,"Ignoring outdated watch update for ",c,". Current version:",d.version," Watch version:",h.version)})),{ks:a,qs:s}}))}function kf(n,e){const t=ne(n);return t.persistence.runTransaction("Allocate target","readwrite",(r=>{let s;return t.Pi.getTargetData(r,e).next((o=>o?(s=o,P.resolve(s)):t.Pi.allocateTargetId(r).next((a=>(s=new Tt(e,a,"TargetPurposeListen",r.currentSequenceNumber),t.Pi.addTargetData(r,s).next((()=>s)))))))})).then((r=>{const s=t.Ms.get(r.targetId);return(s===null||r.snapshotVersion.compareTo(s.snapshotVersion)>0)&&(t.Ms=t.Ms.insert(r.targetId,r),t.xs.set(e,r.targetId)),r}))}async function Zs(n,e,t){const r=ne(n),s=r.Ms.get(e),o=t?"readwrite":"readwrite-primary";try{t||await r.persistence.runTransaction("Release target",o,(a=>r.persistence.referenceDelegate.removeTarget(a,s)))}catch(a){if(!En(a))throw a;U(bi,`Failed to update sequence numbers for target ${e}: ${a}`)}r.Ms=r.Ms.remove(e),r.xs.delete(s.target)}function ba(n,e,t){const r=ne(n);let s=G.min(),o=se();return r.persistence.runTransaction("Execute query","readwrite",(a=>(function(h,d,p){const m=ne(h),I=m.xs.get(p);return I!==void 0?P.resolve(m.Ms.get(I)):m.Pi.getTargetData(d,p)})(r,a,ot(e)).next((c=>{if(c)return s=c.lastLimboFreeSnapshotVersion,r.Pi.getMatchingKeysForTargetId(a,c.targetId).next((h=>{o=h}))})).next((()=>r.Fs.getDocumentsMatchingQuery(a,e,t?s:G.min(),t?o:se()))).next((c=>(Nf(r,Sd(e),c),{documents:c,Qs:o})))))}function Nf(n,e,t){let r=n.Os.get(e)||G.min();t.forEach(((s,o)=>{o.readTime.compareTo(r)>0&&(r=o.readTime)})),n.Os.set(e,r)}class Aa{constructor(){this.activeTargetIds=Dd()}zs(e){this.activeTargetIds=this.activeTargetIds.add(e)}js(e){this.activeTargetIds=this.activeTargetIds.delete(e)}Gs(){const e={activeTargetIds:this.activeTargetIds.toArray(),updateTimeMs:Date.now()};return JSON.stringify(e)}}class Ff{constructor(){this.Mo=new Aa,this.xo={},this.onlineStateHandler=null,this.sequenceNumberHandler=null}addPendingMutation(e){}updateMutationState(e,t,r){}addLocalQueryTarget(e,t=!0){return t&&this.Mo.zs(e),this.xo[e]||"not-current"}updateQueryState(e,t,r){this.xo[e]=t}removeLocalQueryTarget(e){this.Mo.js(e)}isLocalQueryTarget(e){return this.Mo.activeTargetIds.has(e)}clearQueryState(e){delete this.xo[e]}getAllActiveQueryTargets(){return this.Mo.activeTargetIds}isActiveQueryTarget(e){return this.Mo.activeTargetIds.has(e)}start(){return this.Mo=new Aa,Promise.resolve()}handleUserChange(e,t,r){}setOnlineState(e){}shutdown(){}writeSequenceNumber(e){}notifyBundleLoaded(e){}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Mf{Oo(e){}shutdown(){}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Sa="ConnectivityMonitor";class Ra{constructor(){this.No=()=>this.Bo(),this.Lo=()=>this.ko(),this.qo=[],this.Qo()}Oo(e){this.qo.push(e)}shutdown(){window.removeEventListener("online",this.No),window.removeEventListener("offline",this.Lo)}Qo(){window.addEventListener("online",this.No),window.addEventListener("offline",this.Lo)}Bo(){U(Sa,"Network connectivity changed: AVAILABLE");for(const e of this.qo)e(0)}ko(){U(Sa,"Network connectivity changed: UNAVAILABLE");for(const e of this.qo)e(1)}static v(){return typeof window<"u"&&window.addEventListener!==void 0&&window.removeEventListener!==void 0}}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */let Sr=null;function ei(){return Sr===null?Sr=(function(){return 268435456+Math.round(2147483648*Math.random())})():Sr++,"0x"+Sr.toString(16)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const xs="RestConnection",Of={BatchGetDocuments:"batchGet",Commit:"commit",RunQuery:"runQuery",RunAggregationQuery:"runAggregationQuery"};class Lf{get $o(){return!1}constructor(e){this.databaseInfo=e,this.databaseId=e.databaseId;const t=e.ssl?"https":"http",r=encodeURIComponent(this.databaseId.projectId),s=encodeURIComponent(this.databaseId.database);this.Uo=t+"://"+e.host,this.Ko=`projects/${r}/databases/${s}`,this.Wo=this.databaseId.database===Ur?`project_id=${r}`:`project_id=${r}&database_id=${s}`}Go(e,t,r,s,o){const a=ei(),c=this.zo(e,t.toUriEncodedString());U(xs,`Sending RPC '${e}' ${a}:`,c,r);const h={"google-cloud-resource-prefix":this.Ko,"x-goog-request-params":this.Wo};this.jo(h,s,o);const{host:d}=new URL(c),p=ci(d);return this.Jo(e,c,h,r,p).then((m=>(U(xs,`Received RPC '${e}' ${a}: `,m),m)),(m=>{throw un(xs,`RPC '${e}' ${a} failed with error: `,m,"url: ",c,"request:",r),m}))}Ho(e,t,r,s,o,a){return this.Go(e,t,r,s,o)}jo(e,t,r){e["X-Goog-Api-Client"]=(function(){return"gl-js/ fire/"+_n})(),e["Content-Type"]="text/plain",this.databaseInfo.appId&&(e["X-Firebase-GMPID"]=this.databaseInfo.appId),t&&t.headers.forEach(((s,o)=>e[o]=s)),r&&r.headers.forEach(((s,o)=>e[o]=s))}zo(e,t){const r=Of[e];return`${this.Uo}/v1/${t}:${r}`}terminate(){}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Uf{constructor(e){this.Yo=e.Yo,this.Zo=e.Zo}Xo(e){this.e_=e}t_(e){this.n_=e}r_(e){this.i_=e}onMessage(e){this.s_=e}close(){this.Zo()}send(e){this.Yo(e)}o_(){this.e_()}__(){this.n_()}a_(e){this.i_(e)}u_(e){this.s_(e)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ue="WebChannelConnection";class Bf extends Lf{constructor(e){super(e),this.c_=[],this.forceLongPolling=e.forceLongPolling,this.autoDetectLongPolling=e.autoDetectLongPolling,this.useFetchStreams=e.useFetchStreams,this.longPollingOptions=e.longPollingOptions}Jo(e,t,r,s,o){const a=ei();return new Promise(((c,h)=>{const d=new al;d.setWithCredentials(!0),d.listenOnce(ll.COMPLETE,(()=>{try{switch(d.getLastErrorCode()){case Cr.NO_ERROR:const m=d.getResponseJson();U(Ue,`XHR for RPC '${e}' ${a} received:`,JSON.stringify(m)),c(m);break;case Cr.TIMEOUT:U(Ue,`RPC '${e}' ${a} timed out`),h(new j(D.DEADLINE_EXCEEDED,"Request time out"));break;case Cr.HTTP_ERROR:const I=d.getStatus();if(U(Ue,`RPC '${e}' ${a} failed with status:`,I,"response text:",d.getResponseText()),I>0){let R=d.getResponseJson();Array.isArray(R)&&(R=R[0]);const L=R?.error;if(L&&L.status&&L.message){const z=(function(X){const oe=X.toLowerCase().replace(/_/g,"-");return Object.values(D).indexOf(oe)>=0?oe:D.UNKNOWN})(L.status);h(new j(z,L.message))}else h(new j(D.UNKNOWN,"Server responded with status "+d.getStatus()))}else h(new j(D.UNAVAILABLE,"Connection failed."));break;default:H(9055,{l_:e,streamId:a,h_:d.getLastErrorCode(),P_:d.getLastError()})}}finally{U(Ue,`RPC '${e}' ${a} completed.`)}}));const p=JSON.stringify(s);U(Ue,`RPC '${e}' ${a} sending request:`,s),d.send(t,"POST",p,r,15)}))}T_(e,t,r){const s=ei(),o=[this.Uo,"/","google.firestore.v1.Firestore","/",e,"/channel"],a=hl(),c=ul(),h={httpSessionIdParam:"gsessionid",initMessageHeaders:{},messageUrlParams:{database:`projects/${this.databaseId.projectId}/databases/${this.databaseId.database}`},sendRawJson:!0,supportsCrossDomainXhr:!0,internalChannelParams:{forwardChannelRequestTimeoutMs:6e5},forceLongPolling:this.forceLongPolling,detectBufferingProxy:this.autoDetectLongPolling},d=this.longPollingOptions.timeoutSeconds;d!==void 0&&(h.longPollingTimeout=Math.round(1e3*d)),this.useFetchStreams&&(h.useFetchStreams=!0),this.jo(h.initMessageHeaders,t,r),h.encodeInitMessageHeaders=!0;const p=o.join("");U(Ue,`Creating RPC '${e}' stream ${s}: ${p}`,h);const m=a.createWebChannel(p,h);this.I_(m);let I=!1,R=!1;const L=new Uf({Yo:F=>{R?U(Ue,`Not sending because RPC '${e}' stream ${s} is closed:`,F):(I||(U(Ue,`Opening RPC '${e}' stream ${s} transport.`),m.open(),I=!0),U(Ue,`RPC '${e}' stream ${s} sending:`,F),m.send(F))},Zo:()=>m.close()}),z=(F,X,oe)=>{F.listen(X,(ie=>{try{oe(ie)}catch(xe){setTimeout((()=>{throw xe}),0)}}))};return z(m,zn.EventType.OPEN,(()=>{R||(U(Ue,`RPC '${e}' stream ${s} transport opened.`),L.o_())})),z(m,zn.EventType.CLOSE,(()=>{R||(R=!0,U(Ue,`RPC '${e}' stream ${s} transport closed`),L.a_(),this.E_(m))})),z(m,zn.EventType.ERROR,(F=>{R||(R=!0,un(Ue,`RPC '${e}' stream ${s} transport errored. Name:`,F.name,"Message:",F.message),L.a_(new j(D.UNAVAILABLE,"The operation could not be completed")))})),z(m,zn.EventType.MESSAGE,(F=>{if(!R){const X=F.data[0];Ee(!!X,16349);const oe=X,ie=oe?.error||oe[0]?.error;if(ie){U(Ue,`RPC '${e}' stream ${s} received error:`,ie);const xe=ie.status;let Se=(function(g){const _=Re[g];if(_!==void 0)return zl(_)})(xe),me=ie.message;Se===void 0&&(Se=D.INTERNAL,me="Unknown error status: "+xe+" with message "+ie.message),R=!0,L.a_(new j(Se,me)),m.close()}else U(Ue,`RPC '${e}' stream ${s} received:`,X),L.u_(X)}})),z(c,cl.STAT_EVENT,(F=>{F.stat===Bs.PROXY?U(Ue,`RPC '${e}' stream ${s} detected buffering proxy`):F.stat===Bs.NOPROXY&&U(Ue,`RPC '${e}' stream ${s} detected no buffering proxy`)})),setTimeout((()=>{L.__()}),0),L}terminate(){this.c_.forEach((e=>e.close())),this.c_=[]}I_(e){this.c_.push(e)}E_(e){this.c_=this.c_.filter((t=>t===e))}}function Vs(){return typeof document<"u"?document:null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function rs(n){return new Qd(n,!0)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class rc{constructor(e,t,r=1e3,s=1.5,o=6e4){this.Mi=e,this.timerId=t,this.d_=r,this.A_=s,this.R_=o,this.V_=0,this.m_=null,this.f_=Date.now(),this.reset()}reset(){this.V_=0}g_(){this.V_=this.R_}p_(e){this.cancel();const t=Math.floor(this.V_+this.y_()),r=Math.max(0,Date.now()-this.f_),s=Math.max(0,t-r);s>0&&U("ExponentialBackoff",`Backing off for ${s} ms (base delay: ${this.V_} ms, delay with jitter: ${t} ms, last attempt: ${r} ms ago)`),this.m_=this.Mi.enqueueAfterDelay(this.timerId,s,(()=>(this.f_=Date.now(),e()))),this.V_*=this.A_,this.V_<this.d_&&(this.V_=this.d_),this.V_>this.R_&&(this.V_=this.R_)}w_(){this.m_!==null&&(this.m_.skipDelay(),this.m_=null)}cancel(){this.m_!==null&&(this.m_.cancel(),this.m_=null)}y_(){return(Math.random()-.5)*this.V_}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ca="PersistentStream";class jf{constructor(e,t,r,s,o,a,c,h){this.Mi=e,this.S_=r,this.b_=s,this.connection=o,this.authCredentialsProvider=a,this.appCheckCredentialsProvider=c,this.listener=h,this.state=0,this.D_=0,this.C_=null,this.v_=null,this.stream=null,this.F_=0,this.M_=new rc(e,t)}x_(){return this.state===1||this.state===5||this.O_()}O_(){return this.state===2||this.state===3}start(){this.F_=0,this.state!==4?this.auth():this.N_()}async stop(){this.x_()&&await this.close(0)}B_(){this.state=0,this.M_.reset()}L_(){this.O_()&&this.C_===null&&(this.C_=this.Mi.enqueueAfterDelay(this.S_,6e4,(()=>this.k_())))}q_(e){this.Q_(),this.stream.send(e)}async k_(){if(this.O_())return this.close(0)}Q_(){this.C_&&(this.C_.cancel(),this.C_=null)}U_(){this.v_&&(this.v_.cancel(),this.v_=null)}async close(e,t){this.Q_(),this.U_(),this.M_.cancel(),this.D_++,e!==4?this.M_.reset():t&&t.code===D.RESOURCE_EXHAUSTED?(ht(t.toString()),ht("Using maximum backoff delay to prevent overloading the backend."),this.M_.g_()):t&&t.code===D.UNAUTHENTICATED&&this.state!==3&&(this.authCredentialsProvider.invalidateToken(),this.appCheckCredentialsProvider.invalidateToken()),this.stream!==null&&(this.K_(),this.stream.close(),this.stream=null),this.state=e,await this.listener.r_(t)}K_(){}auth(){this.state=1;const e=this.W_(this.D_),t=this.D_;Promise.all([this.authCredentialsProvider.getToken(),this.appCheckCredentialsProvider.getToken()]).then((([r,s])=>{this.D_===t&&this.G_(r,s)}),(r=>{e((()=>{const s=new j(D.UNKNOWN,"Fetching auth token failed: "+r.message);return this.z_(s)}))}))}G_(e,t){const r=this.W_(this.D_);this.stream=this.j_(e,t),this.stream.Xo((()=>{r((()=>this.listener.Xo()))})),this.stream.t_((()=>{r((()=>(this.state=2,this.v_=this.Mi.enqueueAfterDelay(this.b_,1e4,(()=>(this.O_()&&(this.state=3),Promise.resolve()))),this.listener.t_())))})),this.stream.r_((s=>{r((()=>this.z_(s)))})),this.stream.onMessage((s=>{r((()=>++this.F_==1?this.J_(s):this.onNext(s)))}))}N_(){this.state=5,this.M_.p_((async()=>{this.state=0,this.start()}))}z_(e){return U(Ca,`close with error: ${e}`),this.stream=null,this.close(4,e)}W_(e){return t=>{this.Mi.enqueueAndForget((()=>this.D_===e?t():(U(Ca,"stream callback skipped by getCloseGuardedDispatcher."),Promise.resolve())))}}}class zf extends jf{constructor(e,t,r,s,o,a){super(e,"listen_stream_connection_backoff","listen_stream_idle","health_check_timeout",t,r,s,a),this.serializer=o}j_(e,t){return this.connection.T_("Listen",e,t)}J_(e){return this.onNext(e)}onNext(e){this.M_.reset();const t=Xd(this.serializer,e),r=(function(o){if(!("targetChange"in o))return G.min();const a=o.targetChange;return a.targetIds&&a.targetIds.length?G.min():a.readTime?on(a.readTime):G.min()})(e);return this.listener.H_(t,r)}Y_(e){const t={};t.database=va(this.serializer),t.addTarget=(function(o,a){let c;const h=a.target;if(c=Gs(h)?{documents:Jd(o,h)}:{query:Zd(o,h).ft},c.targetId=a.targetId,a.resumeToken.approximateByteSize()>0){c.resumeToken=Gl(o,a.resumeToken);const d=Ys(o,a.expectedCount);d!==null&&(c.expectedCount=d)}else if(a.snapshotVersion.compareTo(G.min())>0){c.readTime=Xs(o,a.snapshotVersion.toTimestamp());const d=Ys(o,a.expectedCount);d!==null&&(c.expectedCount=d)}return c})(this.serializer,e);const r=tf(this.serializer,e);r&&(t.labels=r),this.q_(t)}Z_(e){const t={};t.database=va(this.serializer),t.removeTarget=e,this.q_(t)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class $f{}class qf extends $f{constructor(e,t,r,s){super(),this.authCredentials=e,this.appCheckCredentials=t,this.connection=r,this.serializer=s,this.ia=!1}sa(){if(this.ia)throw new j(D.FAILED_PRECONDITION,"The client has already been terminated.")}Go(e,t,r,s){return this.sa(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then((([o,a])=>this.connection.Go(e,Js(t,r),s,o,a))).catch((o=>{throw o.name==="FirebaseError"?(o.code===D.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),o):new j(D.UNKNOWN,o.toString())}))}Ho(e,t,r,s,o){return this.sa(),Promise.all([this.authCredentials.getToken(),this.appCheckCredentials.getToken()]).then((([a,c])=>this.connection.Ho(e,Js(t,r),s,a,c,o))).catch((a=>{throw a.name==="FirebaseError"?(a.code===D.UNAUTHENTICATED&&(this.authCredentials.invalidateToken(),this.appCheckCredentials.invalidateToken()),a):new j(D.UNKNOWN,a.toString())}))}terminate(){this.ia=!0,this.connection.terminate()}}class Gf{constructor(e,t){this.asyncQueue=e,this.onlineStateHandler=t,this.state="Unknown",this.oa=0,this._a=null,this.aa=!0}ua(){this.oa===0&&(this.ca("Unknown"),this._a=this.asyncQueue.enqueueAfterDelay("online_state_timeout",1e4,(()=>(this._a=null,this.la("Backend didn't respond within 10 seconds."),this.ca("Offline"),Promise.resolve()))))}ha(e){this.state==="Online"?this.ca("Unknown"):(this.oa++,this.oa>=1&&(this.Pa(),this.la(`Connection failed 1 times. Most recent error: ${e.toString()}`),this.ca("Offline")))}set(e){this.Pa(),this.oa=0,e==="Online"&&(this.aa=!1),this.ca(e)}ca(e){e!==this.state&&(this.state=e,this.onlineStateHandler(e))}la(e){const t=`Could not reach Cloud Firestore backend. ${e}
This typically indicates that your device does not have a healthy Internet connection at the moment. The client will operate in offline mode until it is able to successfully connect to the backend.`;this.aa?(ht(t),this.aa=!1):U("OnlineStateTracker",t)}Pa(){this._a!==null&&(this._a.cancel(),this._a=null)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const mn="RemoteStore";class Hf{constructor(e,t,r,s,o){this.localStore=e,this.datastore=t,this.asyncQueue=r,this.remoteSyncer={},this.Ta=[],this.Ia=new Map,this.Ea=new Set,this.da=[],this.Aa=o,this.Aa.Oo((a=>{r.enqueueAndForget((async()=>{lr(this)&&(U(mn,"Restarting streams for network reachability change."),await(async function(h){const d=ne(h);d.Ea.add(4),await ar(d),d.Ra.set("Unknown"),d.Ea.delete(4),await ss(d)})(this))}))})),this.Ra=new Gf(r,s)}}async function ss(n){if(lr(n))for(const e of n.da)await e(!0)}async function ar(n){for(const e of n.da)await e(!1)}function sc(n,e){const t=ne(n);t.Ia.has(e.targetId)||(t.Ia.set(e.targetId,e),Ci(t)?Ri(t):wn(t).O_()&&Si(t,e))}function Ai(n,e){const t=ne(n),r=wn(t);t.Ia.delete(e),r.O_()&&ic(t,e),t.Ia.size===0&&(r.O_()?r.L_():lr(t)&&t.Ra.set("Unknown"))}function Si(n,e){if(n.Va.Ue(e.targetId),e.resumeToken.approximateByteSize()>0||e.snapshotVersion.compareTo(G.min())>0){const t=n.remoteSyncer.getRemoteKeysForTarget(e.targetId).size;e=e.withExpectedCount(t)}wn(n).Y_(e)}function ic(n,e){n.Va.Ue(e),wn(n).Z_(e)}function Ri(n){n.Va=new Gd({getRemoteKeysForTarget:e=>n.remoteSyncer.getRemoteKeysForTarget(e),At:e=>n.Ia.get(e)||null,ht:()=>n.datastore.serializer.databaseId}),wn(n).start(),n.Ra.ua()}function Ci(n){return lr(n)&&!wn(n).x_()&&n.Ia.size>0}function lr(n){return ne(n).Ea.size===0}function oc(n){n.Va=void 0}async function Kf(n){n.Ra.set("Online")}async function Wf(n){n.Ia.forEach(((e,t)=>{Si(n,e)}))}async function Qf(n,e){oc(n),Ci(n)?(n.Ra.ha(e),Ri(n)):n.Ra.set("Unknown")}async function Yf(n,e,t){if(n.Ra.set("Online"),e instanceof ql&&e.state===2&&e.cause)try{await(async function(s,o){const a=o.cause;for(const c of o.targetIds)s.Ia.has(c)&&(await s.remoteSyncer.rejectListen(c,a),s.Ia.delete(c),s.Va.removeTarget(c))})(n,e)}catch(r){U(mn,"Failed to remove targets %s: %s ",e.targetIds.join(","),r),await Pa(n,r)}else if(e instanceof Dr?n.Va.Ze(e):e instanceof $l?n.Va.st(e):n.Va.tt(e),!t.isEqual(G.min()))try{const r=await nc(n.localStore);t.compareTo(r)>=0&&await(function(o,a){const c=o.Va.Tt(a);return c.targetChanges.forEach(((h,d)=>{if(h.resumeToken.approximateByteSize()>0){const p=o.Ia.get(d);p&&o.Ia.set(d,p.withResumeToken(h.resumeToken,a))}})),c.targetMismatches.forEach(((h,d)=>{const p=o.Ia.get(h);if(!p)return;o.Ia.set(h,p.withResumeToken(Oe.EMPTY_BYTE_STRING,p.snapshotVersion)),ic(o,h);const m=new Tt(p.target,h,d,p.sequenceNumber);Si(o,m)})),o.remoteSyncer.applyRemoteEvent(c)})(n,t)}catch(r){U(mn,"Failed to raise snapshot:",r),await Pa(n,r)}}async function Pa(n,e,t){if(!En(e))throw e;n.Ea.add(1),await ar(n),n.Ra.set("Offline"),t||(t=()=>nc(n.localStore)),n.asyncQueue.enqueueRetryable((async()=>{U(mn,"Retrying IndexedDB access"),await t(),n.Ea.delete(1),await ss(n)}))}async function xa(n,e){const t=ne(n);t.asyncQueue.verifyOperationInProgress(),U(mn,"RemoteStore received new credentials");const r=lr(t);t.Ea.add(3),await ar(t),r&&t.Ra.set("Unknown"),await t.remoteSyncer.handleCredentialChange(e),t.Ea.delete(3),await ss(t)}async function Xf(n,e){const t=ne(n);e?(t.Ea.delete(2),await ss(t)):e||(t.Ea.add(2),await ar(t),t.Ra.set("Unknown"))}function wn(n){return n.ma||(n.ma=(function(t,r,s){const o=ne(t);return o.sa(),new zf(r,o.connection,o.authCredentials,o.appCheckCredentials,o.serializer,s)})(n.datastore,n.asyncQueue,{Xo:Kf.bind(null,n),t_:Wf.bind(null,n),r_:Qf.bind(null,n),H_:Yf.bind(null,n)}),n.da.push((async e=>{e?(n.ma.B_(),Ci(n)?Ri(n):n.Ra.set("Unknown")):(await n.ma.stop(),oc(n))}))),n.ma}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Pi{constructor(e,t,r,s,o){this.asyncQueue=e,this.timerId=t,this.targetTimeMs=r,this.op=s,this.removalCallback=o,this.deferred=new sn,this.then=this.deferred.promise.then.bind(this.deferred.promise),this.deferred.promise.catch((a=>{}))}get promise(){return this.deferred.promise}static createAndSchedule(e,t,r,s,o){const a=Date.now()+r,c=new Pi(e,t,a,s,o);return c.start(r),c}start(e){this.timerHandle=setTimeout((()=>this.handleDelayElapsed()),e)}skipDelay(){return this.handleDelayElapsed()}cancel(e){this.timerHandle!==null&&(this.clearTimeout(),this.deferred.reject(new j(D.CANCELLED,"Operation cancelled"+(e?": "+e:""))))}handleDelayElapsed(){this.asyncQueue.enqueueAndForget((()=>this.timerHandle!==null?(this.clearTimeout(),this.op().then((e=>this.deferred.resolve(e)))):Promise.resolve()))}clearTimeout(){this.timerHandle!==null&&(this.removalCallback(this),clearTimeout(this.timerHandle),this.timerHandle=null)}}function ac(n,e){if(ht("AsyncQueue",`${e}: ${n}`),En(n))return new j(D.UNAVAILABLE,`${e}: ${n}`);throw n}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class an{static emptySet(e){return new an(e.comparator)}constructor(e){this.comparator=e?(t,r)=>e(t,r)||q.comparator(t.key,r.key):(t,r)=>q.comparator(t.key,r.key),this.keyedMap=$n(),this.sortedSet=new Ae(this.comparator)}has(e){return this.keyedMap.get(e)!=null}get(e){return this.keyedMap.get(e)}first(){return this.sortedSet.minKey()}last(){return this.sortedSet.maxKey()}isEmpty(){return this.sortedSet.isEmpty()}indexOf(e){const t=this.keyedMap.get(e);return t?this.sortedSet.indexOf(t):-1}get size(){return this.sortedSet.size}forEach(e){this.sortedSet.inorderTraversal(((t,r)=>(e(t),!1)))}add(e){const t=this.delete(e.key);return t.copy(t.keyedMap.insert(e.key,e),t.sortedSet.insert(e,null))}delete(e){const t=this.get(e);return t?this.copy(this.keyedMap.remove(e),this.sortedSet.remove(t)):this}isEqual(e){if(!(e instanceof an)||this.size!==e.size)return!1;const t=this.sortedSet.getIterator(),r=e.sortedSet.getIterator();for(;t.hasNext();){const s=t.getNext().key,o=r.getNext().key;if(!s.isEqual(o))return!1}return!0}toString(){const e=[];return this.forEach((t=>{e.push(t.toString())})),e.length===0?"DocumentSet ()":`DocumentSet (
  `+e.join(`  
`)+`
)`}copy(e,t){const r=new an;return r.comparator=this.comparator,r.keyedMap=e,r.sortedSet=t,r}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Va{constructor(){this.ga=new Ae(q.comparator)}track(e){const t=e.doc.key,r=this.ga.get(t);r?e.type!==0&&r.type===3?this.ga=this.ga.insert(t,e):e.type===3&&r.type!==1?this.ga=this.ga.insert(t,{type:r.type,doc:e.doc}):e.type===2&&r.type===2?this.ga=this.ga.insert(t,{type:2,doc:e.doc}):e.type===2&&r.type===0?this.ga=this.ga.insert(t,{type:0,doc:e.doc}):e.type===1&&r.type===0?this.ga=this.ga.remove(t):e.type===1&&r.type===2?this.ga=this.ga.insert(t,{type:1,doc:r.doc}):e.type===0&&r.type===1?this.ga=this.ga.insert(t,{type:2,doc:e.doc}):H(63341,{Rt:e,pa:r}):this.ga=this.ga.insert(t,e)}ya(){const e=[];return this.ga.inorderTraversal(((t,r)=>{e.push(r)})),e}}class gn{constructor(e,t,r,s,o,a,c,h,d){this.query=e,this.docs=t,this.oldDocs=r,this.docChanges=s,this.mutatedKeys=o,this.fromCache=a,this.syncStateChanged=c,this.excludesMetadataChanges=h,this.hasCachedResults=d}static fromInitialDocuments(e,t,r,s,o){const a=[];return t.forEach((c=>{a.push({type:0,doc:c})})),new gn(e,t,an.emptySet(t),a,r,s,!0,!1,o)}get hasPendingWrites(){return!this.mutatedKeys.isEmpty()}isEqual(e){if(!(this.fromCache===e.fromCache&&this.hasCachedResults===e.hasCachedResults&&this.syncStateChanged===e.syncStateChanged&&this.mutatedKeys.isEqual(e.mutatedKeys)&&Jr(this.query,e.query)&&this.docs.isEqual(e.docs)&&this.oldDocs.isEqual(e.oldDocs)))return!1;const t=this.docChanges,r=e.docChanges;if(t.length!==r.length)return!1;for(let s=0;s<t.length;s++)if(t[s].type!==r[s].type||!t[s].doc.isEqual(r[s].doc))return!1;return!0}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Jf{constructor(){this.wa=void 0,this.Sa=[]}ba(){return this.Sa.some((e=>e.Da()))}}class Zf{constructor(){this.queries=Da(),this.onlineState="Unknown",this.Ca=new Set}terminate(){(function(t,r){const s=ne(t),o=s.queries;s.queries=Da(),o.forEach(((a,c)=>{for(const h of c.Sa)h.onError(r)}))})(this,new j(D.ABORTED,"Firestore shutting down"))}}function Da(){return new $t((n=>Dl(n)),Jr)}async function ep(n,e){const t=ne(n);let r=3;const s=e.query;let o=t.queries.get(s);o?!o.ba()&&e.Da()&&(r=2):(o=new Jf,r=e.Da()?0:1);try{switch(r){case 0:o.wa=await t.onListen(s,!0);break;case 1:o.wa=await t.onListen(s,!1);break;case 2:await t.onFirstRemoteStoreListen(s)}}catch(a){const c=ac(a,`Initialization of query '${en(e.query)}' failed`);return void e.onError(c)}t.queries.set(s,o),o.Sa.push(e),e.va(t.onlineState),o.wa&&e.Fa(o.wa)&&xi(t)}async function tp(n,e){const t=ne(n),r=e.query;let s=3;const o=t.queries.get(r);if(o){const a=o.Sa.indexOf(e);a>=0&&(o.Sa.splice(a,1),o.Sa.length===0?s=e.Da()?0:1:!o.ba()&&e.Da()&&(s=2))}switch(s){case 0:return t.queries.delete(r),t.onUnlisten(r,!0);case 1:return t.queries.delete(r),t.onUnlisten(r,!1);case 2:return t.onLastRemoteStoreUnlisten(r);default:return}}function np(n,e){const t=ne(n);let r=!1;for(const s of e){const o=s.query,a=t.queries.get(o);if(a){for(const c of a.Sa)c.Fa(s)&&(r=!0);a.wa=s}}r&&xi(t)}function rp(n,e,t){const r=ne(n),s=r.queries.get(e);if(s)for(const o of s.Sa)o.onError(t);r.queries.delete(e)}function xi(n){n.Ca.forEach((e=>{e.next()}))}var ti,ka;(ka=ti||(ti={})).Ma="default",ka.Cache="cache";class sp{constructor(e,t,r){this.query=e,this.xa=t,this.Oa=!1,this.Na=null,this.onlineState="Unknown",this.options=r||{}}Fa(e){if(!this.options.includeMetadataChanges){const r=[];for(const s of e.docChanges)s.type!==3&&r.push(s);e=new gn(e.query,e.docs,e.oldDocs,r,e.mutatedKeys,e.fromCache,e.syncStateChanged,!0,e.hasCachedResults)}let t=!1;return this.Oa?this.Ba(e)&&(this.xa.next(e),t=!0):this.La(e,this.onlineState)&&(this.ka(e),t=!0),this.Na=e,t}onError(e){this.xa.error(e)}va(e){this.onlineState=e;let t=!1;return this.Na&&!this.Oa&&this.La(this.Na,e)&&(this.ka(this.Na),t=!0),t}La(e,t){if(!e.fromCache||!this.Da())return!0;const r=t!=="Offline";return(!this.options.qa||!r)&&(!e.docs.isEmpty()||e.hasCachedResults||t==="Offline")}Ba(e){if(e.docChanges.length>0)return!0;const t=this.Na&&this.Na.hasPendingWrites!==e.hasPendingWrites;return!(!e.syncStateChanged&&!t)&&this.options.includeMetadataChanges===!0}ka(e){e=gn.fromInitialDocuments(e.query,e.docs,e.mutatedKeys,e.fromCache,e.hasCachedResults),this.Oa=!0,this.xa.next(e)}Da(){return this.options.source!==ti.Cache}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class lc{constructor(e){this.key=e}}class cc{constructor(e){this.key=e}}class ip{constructor(e,t){this.query=e,this.Ya=t,this.Za=null,this.hasCachedResults=!1,this.current=!1,this.Xa=se(),this.mutatedKeys=se(),this.eu=kl(e),this.tu=new an(this.eu)}get nu(){return this.Ya}ru(e,t){const r=t?t.iu:new Va,s=t?t.tu:this.tu;let o=t?t.mutatedKeys:this.mutatedKeys,a=s,c=!1;const h=this.query.limitType==="F"&&s.size===this.query.limit?s.last():null,d=this.query.limitType==="L"&&s.size===this.query.limit?s.first():null;if(e.inorderTraversal(((p,m)=>{const I=s.get(p),R=Zr(this.query,m)?m:null,L=!!I&&this.mutatedKeys.has(I.key),z=!!R&&(R.hasLocalMutations||this.mutatedKeys.has(R.key)&&R.hasCommittedMutations);let F=!1;I&&R?I.data.isEqual(R.data)?L!==z&&(r.track({type:3,doc:R}),F=!0):this.su(I,R)||(r.track({type:2,doc:R}),F=!0,(h&&this.eu(R,h)>0||d&&this.eu(R,d)<0)&&(c=!0)):!I&&R?(r.track({type:0,doc:R}),F=!0):I&&!R&&(r.track({type:1,doc:I}),F=!0,(h||d)&&(c=!0)),F&&(R?(a=a.add(R),o=z?o.add(p):o.delete(p)):(a=a.delete(p),o=o.delete(p)))})),this.query.limit!==null)for(;a.size>this.query.limit;){const p=this.query.limitType==="F"?a.last():a.first();a=a.delete(p.key),o=o.delete(p.key),r.track({type:1,doc:p})}return{tu:a,iu:r,Cs:c,mutatedKeys:o}}su(e,t){return e.hasLocalMutations&&t.hasCommittedMutations&&!t.hasLocalMutations}applyChanges(e,t,r,s){const o=this.tu;this.tu=e.tu,this.mutatedKeys=e.mutatedKeys;const a=e.iu.ya();a.sort(((p,m)=>(function(R,L){const z=F=>{switch(F){case 0:return 1;case 2:case 3:return 2;case 1:return 0;default:return H(20277,{Rt:F})}};return z(R)-z(L)})(p.type,m.type)||this.eu(p.doc,m.doc))),this.ou(r),s=s??!1;const c=t&&!s?this._u():[],h=this.Xa.size===0&&this.current&&!s?1:0,d=h!==this.Za;return this.Za=h,a.length!==0||d?{snapshot:new gn(this.query,e.tu,o,a,e.mutatedKeys,h===0,d,!1,!!r&&r.resumeToken.approximateByteSize()>0),au:c}:{au:c}}va(e){return this.current&&e==="Offline"?(this.current=!1,this.applyChanges({tu:this.tu,iu:new Va,mutatedKeys:this.mutatedKeys,Cs:!1},!1)):{au:[]}}uu(e){return!this.Ya.has(e)&&!!this.tu.has(e)&&!this.tu.get(e).hasLocalMutations}ou(e){e&&(e.addedDocuments.forEach((t=>this.Ya=this.Ya.add(t))),e.modifiedDocuments.forEach((t=>{})),e.removedDocuments.forEach((t=>this.Ya=this.Ya.delete(t))),this.current=e.current)}_u(){if(!this.current)return[];const e=this.Xa;this.Xa=se(),this.tu.forEach((r=>{this.uu(r.key)&&(this.Xa=this.Xa.add(r.key))}));const t=[];return e.forEach((r=>{this.Xa.has(r)||t.push(new cc(r))})),this.Xa.forEach((r=>{e.has(r)||t.push(new lc(r))})),t}cu(e){this.Ya=e.Qs,this.Xa=se();const t=this.ru(e.documents);return this.applyChanges(t,!0)}lu(){return gn.fromInitialDocuments(this.query,this.tu,this.mutatedKeys,this.Za===0,this.hasCachedResults)}}const Vi="SyncEngine";class op{constructor(e,t,r){this.query=e,this.targetId=t,this.view=r}}class ap{constructor(e){this.key=e,this.hu=!1}}class lp{constructor(e,t,r,s,o,a){this.localStore=e,this.remoteStore=t,this.eventManager=r,this.sharedClientState=s,this.currentUser=o,this.maxConcurrentLimboResolutions=a,this.Pu={},this.Tu=new $t((c=>Dl(c)),Jr),this.Iu=new Map,this.Eu=new Set,this.du=new Ae(q.comparator),this.Au=new Map,this.Ru=new Ti,this.Vu={},this.mu=new Map,this.fu=pn.cr(),this.onlineState="Unknown",this.gu=void 0}get isPrimaryClient(){return this.gu===!0}}async function cp(n,e,t=!0){const r=pc(n);let s;const o=r.Tu.get(e);return o?(r.sharedClientState.addLocalQueryTarget(o.targetId),s=o.view.lu()):s=await uc(r,e,t,!0),s}async function up(n,e){const t=pc(n);await uc(t,e,!0,!1)}async function uc(n,e,t,r){const s=await kf(n.localStore,ot(e)),o=s.targetId,a=n.sharedClientState.addLocalQueryTarget(o,t);let c;return r&&(c=await hp(n,e,o,a==="current",s.resumeToken)),n.isPrimaryClient&&t&&sc(n.remoteStore,s),c}async function hp(n,e,t,r,s){n.pu=(m,I,R)=>(async function(z,F,X,oe){let ie=F.view.ru(X);ie.Cs&&(ie=await ba(z.localStore,F.query,!1).then((({documents:w})=>F.view.ru(w,ie))));const xe=oe&&oe.targetChanges.get(F.targetId),Se=oe&&oe.targetMismatches.get(F.targetId)!=null,me=F.view.applyChanges(ie,z.isPrimaryClient,xe,Se);return Fa(z,F.targetId,me.au),me.snapshot})(n,m,I,R);const o=await ba(n.localStore,e,!0),a=new ip(e,o.Qs),c=a.ru(o.documents),h=or.createSynthesizedTargetChangeForCurrentChange(t,r&&n.onlineState!=="Offline",s),d=a.applyChanges(c,n.isPrimaryClient,h);Fa(n,t,d.au);const p=new op(e,t,a);return n.Tu.set(e,p),n.Iu.has(t)?n.Iu.get(t).push(e):n.Iu.set(t,[e]),d.snapshot}async function dp(n,e,t){const r=ne(n),s=r.Tu.get(e),o=r.Iu.get(s.targetId);if(o.length>1)return r.Iu.set(s.targetId,o.filter((a=>!Jr(a,e)))),void r.Tu.delete(e);r.isPrimaryClient?(r.sharedClientState.removeLocalQueryTarget(s.targetId),r.sharedClientState.isActiveQueryTarget(s.targetId)||await Zs(r.localStore,s.targetId,!1).then((()=>{r.sharedClientState.clearQueryState(s.targetId),t&&Ai(r.remoteStore,s.targetId),ni(r,s.targetId)})).catch(Wr)):(ni(r,s.targetId),await Zs(r.localStore,s.targetId,!0))}async function fp(n,e){const t=ne(n),r=t.Tu.get(e),s=t.Iu.get(r.targetId);t.isPrimaryClient&&s.length===1&&(t.sharedClientState.removeLocalQueryTarget(r.targetId),Ai(t.remoteStore,r.targetId))}async function hc(n,e){const t=ne(n);try{const r=await Vf(t.localStore,e);e.targetChanges.forEach(((s,o)=>{const a=t.Au.get(o);a&&(Ee(s.addedDocuments.size+s.modifiedDocuments.size+s.removedDocuments.size<=1,22616),s.addedDocuments.size>0?a.hu=!0:s.modifiedDocuments.size>0?Ee(a.hu,14607):s.removedDocuments.size>0&&(Ee(a.hu,42227),a.hu=!1))})),await fc(t,r,e)}catch(r){await Wr(r)}}function Na(n,e,t){const r=ne(n);if(r.isPrimaryClient&&t===0||!r.isPrimaryClient&&t===1){const s=[];r.Tu.forEach(((o,a)=>{const c=a.view.va(e);c.snapshot&&s.push(c.snapshot)})),(function(a,c){const h=ne(a);h.onlineState=c;let d=!1;h.queries.forEach(((p,m)=>{for(const I of m.Sa)I.va(c)&&(d=!0)})),d&&xi(h)})(r.eventManager,e),s.length&&r.Pu.H_(s),r.onlineState=e,r.isPrimaryClient&&r.sharedClientState.setOnlineState(e)}}async function pp(n,e,t){const r=ne(n);r.sharedClientState.updateQueryState(e,"rejected",t);const s=r.Au.get(e),o=s&&s.key;if(o){let a=new Ae(q.comparator);a=a.insert(o,je.newNoDocument(o,G.min()));const c=se().add(o),h=new ns(G.min(),new Map,new Ae(Z),a,c);await hc(r,h),r.du=r.du.remove(o),r.Au.delete(e),Di(r)}else await Zs(r.localStore,e,!1).then((()=>ni(r,e,t))).catch(Wr)}function ni(n,e,t=null){n.sharedClientState.removeLocalQueryTarget(e);for(const r of n.Iu.get(e))n.Tu.delete(r),t&&n.Pu.yu(r,t);n.Iu.delete(e),n.isPrimaryClient&&n.Ru.jr(e).forEach((r=>{n.Ru.containsKey(r)||dc(n,r)}))}function dc(n,e){n.Eu.delete(e.path.canonicalString());const t=n.du.get(e);t!==null&&(Ai(n.remoteStore,t),n.du=n.du.remove(e),n.Au.delete(t),Di(n))}function Fa(n,e,t){for(const r of t)r instanceof lc?(n.Ru.addReference(r.key,e),mp(n,r)):r instanceof cc?(U(Vi,"Document no longer in limbo: "+r.key),n.Ru.removeReference(r.key,e),n.Ru.containsKey(r.key)||dc(n,r.key)):H(19791,{wu:r})}function mp(n,e){const t=e.key,r=t.path.canonicalString();n.du.get(t)||n.Eu.has(r)||(U(Vi,"New document in limbo: "+t),n.Eu.add(r),Di(n))}function Di(n){for(;n.Eu.size>0&&n.du.size<n.maxConcurrentLimboResolutions;){const e=n.Eu.values().next().value;n.Eu.delete(e);const t=new q(fe.fromString(e)),r=n.fu.next();n.Au.set(r,new ap(t)),n.du=n.du.insert(t,r),sc(n.remoteStore,new Tt(ot(gi(t.path)),r,"TargetPurposeLimboResolution",Qr.ce))}}async function fc(n,e,t){const r=ne(n),s=[],o=[],a=[];r.Tu.isEmpty()||(r.Tu.forEach(((c,h)=>{a.push(r.pu(h,e,t).then((d=>{if((d||t)&&r.isPrimaryClient){const p=d?!d.fromCache:t?.targetChanges.get(h.targetId)?.current;r.sharedClientState.updateQueryState(h.targetId,p?"current":"not-current")}if(d){s.push(d);const p=Ii.As(h.targetId,d);o.push(p)}})))})),await Promise.all(a),r.Pu.H_(s),await(async function(h,d){const p=ne(h);try{await p.persistence.runTransaction("notifyLocalViewChanges","readwrite",(m=>P.forEach(d,(I=>P.forEach(I.Es,(R=>p.persistence.referenceDelegate.addReference(m,I.targetId,R))).next((()=>P.forEach(I.ds,(R=>p.persistence.referenceDelegate.removeReference(m,I.targetId,R)))))))))}catch(m){if(!En(m))throw m;U(bi,"Failed to update sequence numbers: "+m)}for(const m of d){const I=m.targetId;if(!m.fromCache){const R=p.Ms.get(I),L=R.snapshotVersion,z=R.withLastLimboFreeSnapshotVersion(L);p.Ms=p.Ms.insert(I,z)}}})(r.localStore,o))}async function gp(n,e){const t=ne(n);if(!t.currentUser.isEqual(e)){U(Vi,"User change. New user:",e.toKey());const r=await tc(t.localStore,e);t.currentUser=e,(function(o,a){o.mu.forEach((c=>{c.forEach((h=>{h.reject(new j(D.CANCELLED,a))}))})),o.mu.clear()})(t,"'waitForPendingWrites' promise is rejected due to a user change."),t.sharedClientState.handleUserChange(e,r.removedBatchIds,r.addedBatchIds),await fc(t,r.Ls)}}function yp(n,e){const t=ne(n),r=t.Au.get(e);if(r&&r.hu)return se().add(r.key);{let s=se();const o=t.Iu.get(e);if(!o)return s;for(const a of o){const c=t.Tu.get(a);s=s.unionWith(c.view.nu)}return s}}function pc(n){const e=ne(n);return e.remoteStore.remoteSyncer.applyRemoteEvent=hc.bind(null,e),e.remoteStore.remoteSyncer.getRemoteKeysForTarget=yp.bind(null,e),e.remoteStore.remoteSyncer.rejectListen=pp.bind(null,e),e.Pu.H_=np.bind(null,e.eventManager),e.Pu.yu=rp.bind(null,e.eventManager),e}class Gr{constructor(){this.kind="memory",this.synchronizeTabs=!1}async initialize(e){this.serializer=rs(e.databaseInfo.databaseId),this.sharedClientState=this.Du(e),this.persistence=this.Cu(e),await this.persistence.start(),this.localStore=this.vu(e),this.gcScheduler=this.Fu(e,this.localStore),this.indexBackfillerScheduler=this.Mu(e,this.localStore)}Fu(e,t){return null}Mu(e,t){return null}vu(e){return xf(this.persistence,new Rf,e.initialUser,this.serializer)}Cu(e){return new ec(wi.mi,this.serializer)}Du(e){return new Ff}async terminate(){this.gcScheduler?.stop(),this.indexBackfillerScheduler?.stop(),this.sharedClientState.shutdown(),await this.persistence.shutdown()}}Gr.provider={build:()=>new Gr};class _p extends Gr{constructor(e){super(),this.cacheSizeBytes=e}Fu(e,t){Ee(this.persistence.referenceDelegate instanceof qr,46915);const r=this.persistence.referenceDelegate.garbageCollector;return new df(r,e.asyncQueue,t)}Cu(e){const t=this.cacheSizeBytes!==void 0?He.withCacheSize(this.cacheSizeBytes):He.DEFAULT;return new ec((r=>qr.mi(r,t)),this.serializer)}}class ri{async initialize(e,t){this.localStore||(this.localStore=e.localStore,this.sharedClientState=e.sharedClientState,this.datastore=this.createDatastore(t),this.remoteStore=this.createRemoteStore(t),this.eventManager=this.createEventManager(t),this.syncEngine=this.createSyncEngine(t,!e.synchronizeTabs),this.sharedClientState.onlineStateHandler=r=>Na(this.syncEngine,r,1),this.remoteStore.remoteSyncer.handleCredentialChange=gp.bind(null,this.syncEngine),await Xf(this.remoteStore,this.syncEngine.isPrimaryClient))}createEventManager(e){return(function(){return new Zf})()}createDatastore(e){const t=rs(e.databaseInfo.databaseId),r=(function(o){return new Bf(o)})(e.databaseInfo);return(function(o,a,c,h){return new qf(o,a,c,h)})(e.authCredentials,e.appCheckCredentials,r,t)}createRemoteStore(e){return(function(r,s,o,a,c){return new Hf(r,s,o,a,c)})(this.localStore,this.datastore,e.asyncQueue,(t=>Na(this.syncEngine,t,0)),(function(){return Ra.v()?new Ra:new Mf})())}createSyncEngine(e,t){return(function(s,o,a,c,h,d,p){const m=new lp(s,o,a,c,h,d);return p&&(m.gu=!0),m})(this.localStore,this.remoteStore,this.eventManager,this.sharedClientState,e.initialUser,e.maxConcurrentLimboResolutions,t)}async terminate(){await(async function(t){const r=ne(t);U(mn,"RemoteStore shutting down."),r.Ea.add(5),await ar(r),r.Aa.shutdown(),r.Ra.set("Unknown")})(this.remoteStore),this.datastore?.terminate(),this.eventManager?.terminate()}}ri.provider={build:()=>new ri};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *//**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Ep{constructor(e){this.observer=e,this.muted=!1}next(e){this.muted||this.observer.next&&this.Ou(this.observer.next,e)}error(e){this.muted||(this.observer.error?this.Ou(this.observer.error,e):ht("Uncaught Error in snapshot listener:",e.toString()))}Nu(){this.muted=!0}Ou(e,t){setTimeout((()=>{this.muted||e(t)}),0)}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const xt="FirestoreClient";class vp{constructor(e,t,r,s,o){this.authCredentials=e,this.appCheckCredentials=t,this.asyncQueue=r,this.databaseInfo=s,this.user=Be.UNAUTHENTICATED,this.clientId=pl.newId(),this.authCredentialListener=()=>Promise.resolve(),this.appCheckCredentialListener=()=>Promise.resolve(),this._uninitializedComponentsProvider=o,this.authCredentials.start(r,(async a=>{U(xt,"Received user=",a.uid),await this.authCredentialListener(a),this.user=a})),this.appCheckCredentials.start(r,(a=>(U(xt,"Received new app check token=",a),this.appCheckCredentialListener(a,this.user))))}get configuration(){return{asyncQueue:this.asyncQueue,databaseInfo:this.databaseInfo,clientId:this.clientId,authCredentials:this.authCredentials,appCheckCredentials:this.appCheckCredentials,initialUser:this.user,maxConcurrentLimboResolutions:100}}setCredentialChangeListener(e){this.authCredentialListener=e}setAppCheckTokenChangeListener(e){this.appCheckCredentialListener=e}terminate(){this.asyncQueue.enterRestrictedMode();const e=new sn;return this.asyncQueue.enqueueAndForgetEvenWhileRestricted((async()=>{try{this._onlineComponents&&await this._onlineComponents.terminate(),this._offlineComponents&&await this._offlineComponents.terminate(),this.authCredentials.shutdown(),this.appCheckCredentials.shutdown(),e.resolve()}catch(t){const r=ac(t,"Failed to shutdown persistence");e.reject(r)}})),e.promise}}async function Ds(n,e){n.asyncQueue.verifyOperationInProgress(),U(xt,"Initializing OfflineComponentProvider");const t=n.configuration;await e.initialize(t);let r=t.initialUser;n.setCredentialChangeListener((async s=>{r.isEqual(s)||(await tc(e.localStore,s),r=s)})),e.persistence.setDatabaseDeletedListener((()=>n.terminate())),n._offlineComponents=e}async function Ma(n,e){n.asyncQueue.verifyOperationInProgress();const t=await Tp(n);U(xt,"Initializing OnlineComponentProvider"),await e.initialize(t,n.configuration),n.setCredentialChangeListener((r=>xa(e.remoteStore,r))),n.setAppCheckTokenChangeListener(((r,s)=>xa(e.remoteStore,s))),n._onlineComponents=e}async function Tp(n){if(!n._offlineComponents)if(n._uninitializedComponentsProvider){U(xt,"Using user provided OfflineComponentProvider");try{await Ds(n,n._uninitializedComponentsProvider._offline)}catch(e){const t=e;if(!(function(s){return s.name==="FirebaseError"?s.code===D.FAILED_PRECONDITION||s.code===D.UNIMPLEMENTED:!(typeof DOMException<"u"&&s instanceof DOMException)||s.code===22||s.code===20||s.code===11})(t))throw t;un("Error using user provided cache. Falling back to memory cache: "+t),await Ds(n,new Gr)}}else U(xt,"Using default OfflineComponentProvider"),await Ds(n,new _p(void 0));return n._offlineComponents}async function wp(n){return n._onlineComponents||(n._uninitializedComponentsProvider?(U(xt,"Using user provided OnlineComponentProvider"),await Ma(n,n._uninitializedComponentsProvider._online)):(U(xt,"Using default OnlineComponentProvider"),await Ma(n,new ri))),n._onlineComponents}async function Oa(n){const e=await wp(n),t=e.eventManager;return t.onListen=cp.bind(null,e.syncEngine),t.onUnlisten=dp.bind(null,e.syncEngine),t.onFirstRemoteStoreListen=up.bind(null,e.syncEngine),t.onLastRemoteStoreUnlisten=fp.bind(null,e.syncEngine),t}/**
 * @license
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function mc(n){const e={};return n.timeoutSeconds!==void 0&&(e.timeoutSeconds=n.timeoutSeconds),e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const La=new Map;/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const gc="firestore.googleapis.com",Ua=!0;class Ba{constructor(e){if(e.host===void 0){if(e.ssl!==void 0)throw new j(D.INVALID_ARGUMENT,"Can't provide ssl option if host option is not set");this.host=gc,this.ssl=Ua}else this.host=e.host,this.ssl=e.ssl??Ua;if(this.isUsingEmulator=e.emulatorOptions!==void 0,this.credentials=e.credentials,this.ignoreUndefinedProperties=!!e.ignoreUndefinedProperties,this.localCache=e.localCache,e.cacheSizeBytes===void 0)this.cacheSizeBytes=Zl;else{if(e.cacheSizeBytes!==-1&&e.cacheSizeBytes<uf)throw new j(D.INVALID_ARGUMENT,"cacheSizeBytes must be at least 1048576");this.cacheSizeBytes=e.cacheSizeBytes}Jh("experimentalForceLongPolling",e.experimentalForceLongPolling,"experimentalAutoDetectLongPolling",e.experimentalAutoDetectLongPolling),this.experimentalForceLongPolling=!!e.experimentalForceLongPolling,this.experimentalForceLongPolling?this.experimentalAutoDetectLongPolling=!1:e.experimentalAutoDetectLongPolling===void 0?this.experimentalAutoDetectLongPolling=!0:this.experimentalAutoDetectLongPolling=!!e.experimentalAutoDetectLongPolling,this.experimentalLongPollingOptions=mc(e.experimentalLongPollingOptions??{}),(function(r){if(r.timeoutSeconds!==void 0){if(isNaN(r.timeoutSeconds))throw new j(D.INVALID_ARGUMENT,`invalid long polling timeout: ${r.timeoutSeconds} (must not be NaN)`);if(r.timeoutSeconds<5)throw new j(D.INVALID_ARGUMENT,`invalid long polling timeout: ${r.timeoutSeconds} (minimum allowed value is 5)`);if(r.timeoutSeconds>30)throw new j(D.INVALID_ARGUMENT,`invalid long polling timeout: ${r.timeoutSeconds} (maximum allowed value is 30)`)}})(this.experimentalLongPollingOptions),this.useFetchStreams=!!e.useFetchStreams}isEqual(e){return this.host===e.host&&this.ssl===e.ssl&&this.credentials===e.credentials&&this.cacheSizeBytes===e.cacheSizeBytes&&this.experimentalForceLongPolling===e.experimentalForceLongPolling&&this.experimentalAutoDetectLongPolling===e.experimentalAutoDetectLongPolling&&(function(r,s){return r.timeoutSeconds===s.timeoutSeconds})(this.experimentalLongPollingOptions,e.experimentalLongPollingOptions)&&this.ignoreUndefinedProperties===e.ignoreUndefinedProperties&&this.useFetchStreams===e.useFetchStreams}}class ki{constructor(e,t,r,s){this._authCredentials=e,this._appCheckCredentials=t,this._databaseId=r,this._app=s,this.type="firestore-lite",this._persistenceKey="(lite)",this._settings=new Ba({}),this._settingsFrozen=!1,this._emulatorOptions={},this._terminateTask="notTerminated"}get app(){if(!this._app)throw new j(D.FAILED_PRECONDITION,"Firestore was not initialized using the Firebase SDK. 'app' is not available");return this._app}get _initialized(){return this._settingsFrozen}get _terminated(){return this._terminateTask!=="notTerminated"}_setSettings(e){if(this._settingsFrozen)throw new j(D.FAILED_PRECONDITION,"Firestore has already been started and its settings can no longer be changed. You can only modify settings before calling any other methods on a Firestore object.");this._settings=new Ba(e),this._emulatorOptions=e.emulatorOptions||{},e.credentials!==void 0&&(this._authCredentials=(function(r){if(!r)return new zh;switch(r.type){case"firstParty":return new Hh(r.sessionIndex||"0",r.iamToken||null,r.authTokenFactory||null);case"provider":return r.client;default:throw new j(D.INVALID_ARGUMENT,"makeAuthCredentialsProvider failed due to invalid credential type")}})(e.credentials))}_getSettings(){return this._settings}_getEmulatorOptions(){return this._emulatorOptions}_freezeSettings(){return this._settingsFrozen=!0,this._settings}_delete(){return this._terminateTask==="notTerminated"&&(this._terminateTask=this._terminate()),this._terminateTask}async _restart(){this._terminateTask==="notTerminated"?await this._terminate():this._terminateTask="notTerminated"}toJSON(){return{app:this._app,databaseId:this._databaseId,settings:this._settings}}_terminate(){return(function(t){const r=La.get(t);r&&(U("ComponentProvider","Removing Datastore"),La.delete(t),r.terminate())})(this),Promise.resolve()}}function Ip(n,e,t,r={}){n=Pr(n,ki);const s=ci(e),o=n._getSettings(),a={...o,emulatorOptions:n._getEmulatorOptions()},c=`${e}:${t}`;s&&(mu(`https://${c}`),Eu("Firestore",!0)),o.host!==gc&&o.host!==c&&un("Host has been set in both settings() and connectFirestoreEmulator(), emulator host will be used.");const h={...o,host:c,ssl:s,emulatorOptions:r};if(!Fr(h,a)&&(n._setSettings(h),r.mockUserToken)){let d,p;if(typeof r.mockUserToken=="string")d=r.mockUserToken,p=Be.MOCK_USER;else{d=gu(r.mockUserToken,n._app?.options.projectId);const m=r.mockUserToken.sub||r.mockUserToken.user_id;if(!m)throw new j(D.INVALID_ARGUMENT,"mockUserToken must contain 'sub' or 'user_id' field!");p=new Be(m)}n._authCredentials=new $h(new fl(d,p))}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class qt{constructor(e,t,r){this.converter=t,this._query=r,this.type="query",this.firestore=e}withConverter(e){return new qt(this.firestore,e,this._query)}}class $e{constructor(e,t,r){this.converter=t,this._key=r,this.type="document",this.firestore=e}get _path(){return this._key.path}get id(){return this._key.path.lastSegment()}get path(){return this._key.path.canonicalString()}get parent(){return new ln(this.firestore,this.converter,this._key.path.popLast())}withConverter(e){return new $e(this.firestore,e,this._key)}toJSON(){return{type:$e._jsonSchemaVersion,referencePath:this._key.toString()}}static fromJSON(e,t,r){if(ir(t,$e._jsonSchema))return new $e(e,r||null,new q(fe.fromString(t.referencePath)))}}$e._jsonSchemaVersion="firestore/documentReference/1.0",$e._jsonSchema={type:Pe("string",$e._jsonSchemaVersion),referencePath:Pe("string")};class ln extends qt{constructor(e,t,r){super(e,t,gi(r)),this._path=r,this.type="collection"}get id(){return this._query.path.lastSegment()}get path(){return this._query.path.canonicalString()}get parent(){const e=this._path.popLast();return e.isEmpty()?null:new $e(this.firestore,null,new q(e))}withConverter(e){return new ln(this.firestore,e,this._path)}}function bp(n,e,...t){if(n=Xn(n),n instanceof ki){const r=fe.fromString(e,...t);return Xo(r),new ln(n,null,r)}{if(!(n instanceof $e||n instanceof ln))throw new j(D.INVALID_ARGUMENT,"Expected first argument to collection() to be a CollectionReference, a DocumentReference or FirebaseFirestore");const r=n._path.child(fe.fromString(e,...t));return Xo(r),new ln(n.firestore,null,r)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ja="AsyncQueue";class za{constructor(e=Promise.resolve()){this.Xu=[],this.ec=!1,this.tc=[],this.nc=null,this.rc=!1,this.sc=!1,this.oc=[],this.M_=new rc(this,"async_queue_retry"),this._c=()=>{const r=Vs();r&&U(ja,"Visibility state changed to "+r.visibilityState),this.M_.w_()},this.ac=e;const t=Vs();t&&typeof t.addEventListener=="function"&&t.addEventListener("visibilitychange",this._c)}get isShuttingDown(){return this.ec}enqueueAndForget(e){this.enqueue(e)}enqueueAndForgetEvenWhileRestricted(e){this.uc(),this.cc(e)}enterRestrictedMode(e){if(!this.ec){this.ec=!0,this.sc=e||!1;const t=Vs();t&&typeof t.removeEventListener=="function"&&t.removeEventListener("visibilitychange",this._c)}}enqueue(e){if(this.uc(),this.ec)return new Promise((()=>{}));const t=new sn;return this.cc((()=>this.ec&&this.sc?Promise.resolve():(e().then(t.resolve,t.reject),t.promise))).then((()=>t.promise))}enqueueRetryable(e){this.enqueueAndForget((()=>(this.Xu.push(e),this.lc())))}async lc(){if(this.Xu.length!==0){try{await this.Xu[0](),this.Xu.shift(),this.M_.reset()}catch(e){if(!En(e))throw e;U(ja,"Operation failed with retryable error: "+e)}this.Xu.length>0&&this.M_.p_((()=>this.lc()))}}cc(e){const t=this.ac.then((()=>(this.rc=!0,e().catch((r=>{throw this.nc=r,this.rc=!1,ht("INTERNAL UNHANDLED ERROR: ",$a(r)),r})).then((r=>(this.rc=!1,r))))));return this.ac=t,t}enqueueAfterDelay(e,t,r){this.uc(),this.oc.indexOf(e)>-1&&(t=0);const s=Pi.createAndSchedule(this,e,t,r,(o=>this.hc(o)));return this.tc.push(s),s}uc(){this.nc&&H(47125,{Pc:$a(this.nc)})}verifyOperationInProgress(){}async Tc(){let e;do e=this.ac,await e;while(e!==this.ac)}Ic(e){for(const t of this.tc)if(t.timerId===e)return!0;return!1}Ec(e){return this.Tc().then((()=>{this.tc.sort(((t,r)=>t.targetTimeMs-r.targetTimeMs));for(const t of this.tc)if(t.skipDelay(),e!=="all"&&t.timerId===e)break;return this.Tc()}))}dc(e){this.oc.push(e)}hc(e){const t=this.tc.indexOf(e);this.tc.splice(t,1)}}function $a(n){let e=n.message||"";return n.stack&&(e=n.stack.includes(n.message)?n.stack:n.message+`
`+n.stack),e}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function qa(n){return(function(t,r){if(typeof t!="object"||t===null)return!1;const s=t;for(const o of r)if(o in s&&typeof s[o]=="function")return!0;return!1})(n,["next","error","complete"])}class si extends ki{constructor(e,t,r,s){super(e,t,r,s),this.type="firestore",this._queue=new za,this._persistenceKey=s?.name||"[DEFAULT]"}async _terminate(){if(this._firestoreClient){const e=this._firestoreClient.terminate();this._queue=new za(e),this._firestoreClient=void 0,await e}}}function Ap(n,e){const t=typeof n=="object"?n:Ph(),r=typeof n=="string"?n:Ur,s=bh(t,"firestore").getImmediate({identifier:r});if(!s._initialized){const o=fu("firestore");o&&Ip(s,...o)}return s}function Sp(n){if(n._terminated)throw new j(D.FAILED_PRECONDITION,"The client has already been terminated.");return n._firestoreClient||Rp(n),n._firestoreClient}function Rp(n){const e=n._freezeSettings(),t=(function(s,o,a,c){return new ud(s,o,a,c.host,c.ssl,c.experimentalForceLongPolling,c.experimentalAutoDetectLongPolling,mc(c.experimentalLongPollingOptions),c.useFetchStreams,c.isUsingEmulator)})(n._databaseId,n._app?.options.appId||"",n._persistenceKey,e);n._componentsProvider||e.localCache?._offlineComponentProvider&&e.localCache?._onlineComponentProvider&&(n._componentsProvider={_offline:e.localCache._offlineComponentProvider,_online:e.localCache._onlineComponentProvider}),n._firestoreClient=new vp(n._authCredentials,n._appCheckCredentials,n._queue,t,n._componentsProvider&&(function(s){const o=s?._online.build();return{_offline:s?._offline.build(o),_online:o}})(n._componentsProvider))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Xe{constructor(e){this._byteString=e}static fromBase64String(e){try{return new Xe(Oe.fromBase64String(e))}catch(t){throw new j(D.INVALID_ARGUMENT,"Failed to construct data from Base64 string: "+t)}}static fromUint8Array(e){return new Xe(Oe.fromUint8Array(e))}toBase64(){return this._byteString.toBase64()}toUint8Array(){return this._byteString.toUint8Array()}toString(){return"Bytes(base64: "+this.toBase64()+")"}isEqual(e){return this._byteString.isEqual(e._byteString)}toJSON(){return{type:Xe._jsonSchemaVersion,bytes:this.toBase64()}}static fromJSON(e){if(ir(e,Xe._jsonSchema))return Xe.fromBase64String(e.bytes)}}Xe._jsonSchemaVersion="firestore/bytes/1.0",Xe._jsonSchema={type:Pe("string",Xe._jsonSchemaVersion),bytes:Pe("string")};/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class yc{constructor(...e){for(let t=0;t<e.length;++t)if(e[t].length===0)throw new j(D.INVALID_ARGUMENT,"Invalid field name at argument $(i + 1). Field names must not be empty.");this._internalPath=new ze(e)}isEqual(e){return this._internalPath.isEqual(e._internalPath)}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class _c{constructor(e){this._methodName=e}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class at{constructor(e,t){if(!isFinite(e)||e<-90||e>90)throw new j(D.INVALID_ARGUMENT,"Latitude must be a number between -90 and 90, but was: "+e);if(!isFinite(t)||t<-180||t>180)throw new j(D.INVALID_ARGUMENT,"Longitude must be a number between -180 and 180, but was: "+t);this._lat=e,this._long=t}get latitude(){return this._lat}get longitude(){return this._long}isEqual(e){return this._lat===e._lat&&this._long===e._long}_compareTo(e){return Z(this._lat,e._lat)||Z(this._long,e._long)}toJSON(){return{latitude:this._lat,longitude:this._long,type:at._jsonSchemaVersion}}static fromJSON(e){if(ir(e,at._jsonSchema))return new at(e.latitude,e.longitude)}}at._jsonSchemaVersion="firestore/geoPoint/1.0",at._jsonSchema={type:Pe("string",at._jsonSchemaVersion),latitude:Pe("number"),longitude:Pe("number")};/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class lt{constructor(e){this._values=(e||[]).map((t=>t))}toArray(){return this._values.map((e=>e))}isEqual(e){return(function(r,s){if(r.length!==s.length)return!1;for(let o=0;o<r.length;++o)if(r[o]!==s[o])return!1;return!0})(this._values,e._values)}toJSON(){return{type:lt._jsonSchemaVersion,vectorValues:this._values}}static fromJSON(e){if(ir(e,lt._jsonSchema)){if(Array.isArray(e.vectorValues)&&e.vectorValues.every((t=>typeof t=="number")))return new lt(e.vectorValues);throw new j(D.INVALID_ARGUMENT,"Expected 'vectorValues' field to be a number array")}}}lt._jsonSchemaVersion="firestore/vectorValue/1.0",lt._jsonSchema={type:Pe("string",lt._jsonSchemaVersion),vectorValues:Pe("object")};/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Cp=/^__.*__$/;function Ec(n){switch(n){case 0:case 2:case 1:return!0;case 3:case 4:return!1;default:throw H(40011,{Ac:n})}}class Ni{constructor(e,t,r,s,o,a){this.settings=e,this.databaseId=t,this.serializer=r,this.ignoreUndefinedProperties=s,o===void 0&&this.Rc(),this.fieldTransforms=o||[],this.fieldMask=a||[]}get path(){return this.settings.path}get Ac(){return this.settings.Ac}Vc(e){return new Ni({...this.settings,...e},this.databaseId,this.serializer,this.ignoreUndefinedProperties,this.fieldTransforms,this.fieldMask)}mc(e){const t=this.path?.child(e),r=this.Vc({path:t,fc:!1});return r.gc(e),r}yc(e){const t=this.path?.child(e),r=this.Vc({path:t,fc:!1});return r.Rc(),r}wc(e){return this.Vc({path:void 0,fc:!0})}Sc(e){return ii(e,this.settings.methodName,this.settings.bc||!1,this.path,this.settings.Dc)}contains(e){return this.fieldMask.find((t=>e.isPrefixOf(t)))!==void 0||this.fieldTransforms.find((t=>e.isPrefixOf(t.field)))!==void 0}Rc(){if(this.path)for(let e=0;e<this.path.length;e++)this.gc(this.path.get(e))}gc(e){if(e.length===0)throw this.Sc("Document fields must not be empty");if(Ec(this.Ac)&&Cp.test(e))throw this.Sc('Document fields cannot begin and end with "__"')}}class Pp{constructor(e,t,r){this.databaseId=e,this.ignoreUndefinedProperties=t,this.serializer=r||rs(e)}Cc(e,t,r,s=!1){return new Ni({Ac:e,methodName:t,Dc:r,path:ze.emptyPath(),fc:!1,bc:s},this.databaseId,this.serializer,this.ignoreUndefinedProperties)}}function xp(n){const e=n._freezeSettings(),t=rs(n._databaseId);return new Pp(n._databaseId,!!e.ignoreUndefinedProperties,t)}function Vp(n,e,t,r=!1){return Fi(t,n.Cc(r?4:3,e))}function Fi(n,e){if(vc(n=Xn(n)))return kp("Unsupported field value:",e,n),Dp(n,e);if(n instanceof _c)return(function(r,s){if(!Ec(s.Ac))throw s.Sc(`${r._methodName}() can only be used with update() and set()`);if(!s.path)throw s.Sc(`${r._methodName}() is not currently supported inside arrays`);const o=r._toFieldTransform(s);o&&s.fieldTransforms.push(o)})(n,e),null;if(n===void 0&&e.ignoreUndefinedProperties)return null;if(e.path&&e.fieldMask.push(e.path),n instanceof Array){if(e.settings.fc&&e.Ac!==4)throw e.Sc("Nested arrays are not supported");return(function(r,s){const o=[];let a=0;for(const c of r){let h=Fi(c,s.wc(a));h==null&&(h={nullValue:"NULL_VALUE"}),o.push(h),a++}return{arrayValue:{values:o}}})(n,e)}return(function(r,s){if((r=Xn(r))===null)return{nullValue:"NULL_VALUE"};if(typeof r=="number")return kd(s.serializer,r);if(typeof r=="boolean")return{booleanValue:r};if(typeof r=="string")return{stringValue:r};if(r instanceof Date){const o=pe.fromDate(r);return{timestampValue:Xs(s.serializer,o)}}if(r instanceof pe){const o=new pe(r.seconds,1e3*Math.floor(r.nanoseconds/1e3));return{timestampValue:Xs(s.serializer,o)}}if(r instanceof at)return{geoPointValue:{latitude:r.latitude,longitude:r.longitude}};if(r instanceof Xe)return{bytesValue:Gl(s.serializer,r._byteString)};if(r instanceof $e){const o=s.databaseId,a=r.firestore._databaseId;if(!a.isEqual(o))throw s.Sc(`Document reference is for database ${a.projectId}/${a.database} but should be for database ${o.projectId}/${o.database}`);return{referenceValue:Hl(r.firestore._databaseId||s.databaseId,r._key.path)}}if(r instanceof lt)return(function(a,c){return{mapValue:{fields:{[Il]:{stringValue:bl},[Br]:{arrayValue:{values:a.toArray().map((d=>{if(typeof d!="number")throw c.Sc("VectorValues must only contain numeric values.");return yi(c.serializer,d)}))}}}}}})(r,s);throw s.Sc(`Unsupported field value: ${Kr(r)}`)})(n,e)}function Dp(n,e){const t={};return yl(n)?e.path&&e.path.length>0&&e.fieldMask.push(e.path):vn(n,((r,s)=>{const o=Fi(s,e.mc(r));o!=null&&(t[r]=o)})),{mapValue:{fields:t}}}function vc(n){return!(typeof n!="object"||n===null||n instanceof Array||n instanceof Date||n instanceof pe||n instanceof at||n instanceof Xe||n instanceof $e||n instanceof _c||n instanceof lt)}function kp(n,e,t){if(!vc(t)||!ml(t)){const r=Kr(t);throw r==="an object"?e.Sc(n+" a custom object"):e.Sc(n+" "+r)}}const Np=new RegExp("[~\\*/\\[\\]]");function Fp(n,e,t){if(e.search(Np)>=0)throw ii(`Invalid field path (${e}). Paths must not contain '~', '*', '/', '[', or ']'`,n,!1,void 0,t);try{return new yc(...e.split("."))._internalPath}catch{throw ii(`Invalid field path (${e}). Paths must not be empty, begin with '.', end with '.', or contain '..'`,n,!1,void 0,t)}}function ii(n,e,t,r,s){const o=r&&!r.isEmpty(),a=s!==void 0;let c=`Function ${e}() called with invalid data`;t&&(c+=" (via `toFirestore()`)"),c+=". ";let h="";return(o||a)&&(h+=" (found",o&&(h+=` in field ${r}`),a&&(h+=` in document ${s}`),h+=")"),new j(D.INVALID_ARGUMENT,c+n+h)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Tc{constructor(e,t,r,s,o){this._firestore=e,this._userDataWriter=t,this._key=r,this._document=s,this._converter=o}get id(){return this._key.path.lastSegment()}get ref(){return new $e(this._firestore,this._converter,this._key)}exists(){return this._document!==null}data(){if(this._document){if(this._converter){const e=new Mp(this._firestore,this._userDataWriter,this._key,this._document,null);return this._converter.fromFirestore(e)}return this._userDataWriter.convertValue(this._document.data.value)}}get(e){if(this._document){const t=this._document.data.field(Mi("DocumentSnapshot.get",e));if(t!==null)return this._userDataWriter.convertValue(t)}}}class Mp extends Tc{data(){return super.data()}}function Mi(n,e){return typeof e=="string"?Fp(n,e):e instanceof yc?e._internalPath:e._delegate._internalPath}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Op(n){if(n.limitType==="L"&&n.explicitOrderBy.length===0)throw new j(D.UNIMPLEMENTED,"limitToLast() queries require specifying at least one orderBy() clause")}class Oi{}class wc extends Oi{}function Lp(n,e,...t){let r=[];e instanceof Oi&&r.push(e),r=r.concat(t),(function(o){const a=o.filter((h=>h instanceof Ui)).length,c=o.filter((h=>h instanceof Li)).length;if(a>1||a>0&&c>0)throw new j(D.INVALID_ARGUMENT,"InvalidQuery. When using composite filters, you cannot use more than one filter at the top level. Consider nesting the multiple filters within an `and(...)` statement. For example: change `query(query, where(...), or(...))` to `query(query, and(where(...), or(...)))`.")})(r);for(const s of r)n=s._apply(n);return n}class Li extends wc{constructor(e,t,r){super(),this._field=e,this._op=t,this._value=r,this.type="where"}static _create(e,t,r){return new Li(e,t,r)}_apply(e){const t=this._parse(e);return Ic(e._query,t),new qt(e.firestore,e.converter,Hs(e._query,t))}_parse(e){const t=xp(e.firestore);return(function(o,a,c,h,d,p,m){let I;if(d.isKeyField()){if(p==="array-contains"||p==="array-contains-any")throw new j(D.INVALID_ARGUMENT,`Invalid Query. You can't perform '${p}' queries on documentId().`);if(p==="in"||p==="not-in"){Ha(m,p);const L=[];for(const z of m)L.push(Ga(h,o,z));I={arrayValue:{values:L}}}else I=Ga(h,o,m)}else p!=="in"&&p!=="not-in"&&p!=="array-contains-any"||Ha(m,p),I=Vp(c,a,m,p==="in"||p==="not-in");return Ce.create(d,p,I)})(e._query,"where",t,e.firestore._databaseId,this._field,this._op,this._value)}}class Ui extends Oi{constructor(e,t){super(),this.type=e,this._queryConstraints=t}static _create(e,t){return new Ui(e,t)}_parse(e){const t=this._queryConstraints.map((r=>r._parse(e))).filter((r=>r.getFilters().length>0));return t.length===1?t[0]:Je.create(t,this._getOperator())}_apply(e){const t=this._parse(e);return t.getFilters().length===0?e:((function(s,o){let a=s;const c=o.getFlattenedFilters();for(const h of c)Ic(a,h),a=Hs(a,h)})(e._query,t),new qt(e.firestore,e.converter,Hs(e._query,t)))}_getQueryConstraints(){return this._queryConstraints}_getOperator(){return this.type==="and"?"and":"or"}}class Bi extends wc{constructor(e,t){super(),this._field=e,this._direction=t,this.type="orderBy"}static _create(e,t){return new Bi(e,t)}_apply(e){const t=(function(s,o,a){if(s.startAt!==null)throw new j(D.INVALID_ARGUMENT,"Invalid query. You must not call startAt() or startAfter() before calling orderBy().");if(s.endAt!==null)throw new j(D.INVALID_ARGUMENT,"Invalid query. You must not call endAt() or endBefore() before calling orderBy().");return new sr(o,a)})(e._query,this._field,this._direction);return new qt(e.firestore,e.converter,(function(s,o){const a=s.explicitOrderBy.concat([o]);return new Tn(s.path,s.collectionGroup,a,s.filters.slice(),s.limit,s.limitType,s.startAt,s.endAt)})(e._query,t))}}function Up(n,e="asc"){const t=e,r=Mi("orderBy",n);return Bi._create(r,t)}function Ga(n,e,t){if(typeof(t=Xn(t))=="string"){if(t==="")throw new j(D.INVALID_ARGUMENT,"Invalid query. When querying with documentId(), you must provide a valid document ID, but it was an empty string.");if(!Vl(e)&&t.indexOf("/")!==-1)throw new j(D.INVALID_ARGUMENT,`Invalid query. When querying a collection by documentId(), you must provide a plain document ID, but '${t}' contains a '/' character.`);const r=e.path.child(fe.fromString(t));if(!q.isDocumentKey(r))throw new j(D.INVALID_ARGUMENT,`Invalid query. When querying a collection group by documentId(), the value provided must result in a valid document path, but '${r}' is not because it has an odd number of segments (${r.length}).`);return ia(n,new q(r))}if(t instanceof $e)return ia(n,t._key);throw new j(D.INVALID_ARGUMENT,`Invalid query. When querying with documentId(), you must provide a valid string or a DocumentReference, but it was: ${Kr(t)}.`)}function Ha(n,e){if(!Array.isArray(n)||n.length===0)throw new j(D.INVALID_ARGUMENT,`Invalid Query. A non-empty array is required for '${e.toString()}' filters.`)}function Ic(n,e){const t=(function(s,o){for(const a of s)for(const c of a.getFlattenedFilters())if(o.indexOf(c.op)>=0)return c.op;return null})(n.filters,(function(s){switch(s){case"!=":return["!=","not-in"];case"array-contains-any":case"in":return["not-in"];case"not-in":return["array-contains-any","in","not-in","!="];default:return[]}})(e.op));if(t!==null)throw t===e.op?new j(D.INVALID_ARGUMENT,`Invalid query. You cannot use more than one '${e.op.toString()}' filter.`):new j(D.INVALID_ARGUMENT,`Invalid query. You cannot use '${e.op.toString()}' filters with '${t.toString()}' filters.`)}class Bp{convertValue(e,t="none"){switch(Ct(e)){case 0:return null;case 1:return e.booleanValue;case 2:return be(e.integerValue||e.doubleValue);case 3:return this.convertTimestamp(e.timestampValue);case 4:return this.convertServerTimestamp(e,t);case 5:return e.stringValue;case 6:return this.convertBytes(Rt(e.bytesValue));case 7:return this.convertReference(e.referenceValue);case 8:return this.convertGeoPoint(e.geoPointValue);case 9:return this.convertArray(e.arrayValue,t);case 11:return this.convertObject(e.mapValue,t);case 10:return this.convertVectorValue(e.mapValue);default:throw H(62114,{value:e})}}convertObject(e,t){return this.convertObjectMap(e.fields,t)}convertObjectMap(e,t="none"){const r={};return vn(e,((s,o)=>{r[s]=this.convertValue(o,t)})),r}convertVectorValue(e){const t=e.fields?.[Br].arrayValue?.values?.map((r=>be(r.doubleValue)));return new lt(t)}convertGeoPoint(e){return new at(be(e.latitude),be(e.longitude))}convertArray(e,t){return(e.values||[]).map((r=>this.convertValue(r,t)))}convertServerTimestamp(e,t){switch(t){case"previous":const r=Xr(e);return r==null?null:this.convertValue(r,t);case"estimate":return this.convertTimestamp(tr(e));default:return null}}convertTimestamp(e){const t=St(e);return new pe(t.seconds,t.nanos)}convertDocumentKey(e,t){const r=fe.fromString(e);Ee(Jl(r),9688,{name:e});const s=new nr(r.get(1),r.get(3)),o=new q(r.popFirst(5));return s.isEqual(t)||ht(`Document ${o} contains a document reference within a different database (${s.projectId}/${s.database}) which is not supported. It will be treated as a reference in the current database (${t.projectId}/${t.database}) instead.`),o}}class Gn{constructor(e,t){this.hasPendingWrites=e,this.fromCache=t}isEqual(e){return this.hasPendingWrites===e.hasPendingWrites&&this.fromCache===e.fromCache}}class jt extends Tc{constructor(e,t,r,s,o,a){super(e,t,r,s,a),this._firestore=e,this._firestoreImpl=e,this.metadata=o}exists(){return super.exists()}data(e={}){if(this._document){if(this._converter){const t=new kr(this._firestore,this._userDataWriter,this._key,this._document,this.metadata,null);return this._converter.fromFirestore(t,e)}return this._userDataWriter.convertValue(this._document.data.value,e.serverTimestamps)}}get(e,t={}){if(this._document){const r=this._document.data.field(Mi("DocumentSnapshot.get",e));if(r!==null)return this._userDataWriter.convertValue(r,t.serverTimestamps)}}toJSON(){if(this.metadata.hasPendingWrites)throw new j(D.FAILED_PRECONDITION,"DocumentSnapshot.toJSON() attempted to serialize a document with pending writes. Await waitForPendingWrites() before invoking toJSON().");const e=this._document,t={};return t.type=jt._jsonSchemaVersion,t.bundle="",t.bundleSource="DocumentSnapshot",t.bundleName=this._key.toString(),!e||!e.isValidDocument()||!e.isFoundDocument()?t:(this._userDataWriter.convertObjectMap(e.data.value.mapValue.fields,"previous"),t.bundle=(this._firestore,this.ref.path,"NOT SUPPORTED"),t)}}jt._jsonSchemaVersion="firestore/documentSnapshot/1.0",jt._jsonSchema={type:Pe("string",jt._jsonSchemaVersion),bundleSource:Pe("string","DocumentSnapshot"),bundleName:Pe("string"),bundle:Pe("string")};class kr extends jt{data(e={}){return super.data(e)}}class cn{constructor(e,t,r,s){this._firestore=e,this._userDataWriter=t,this._snapshot=s,this.metadata=new Gn(s.hasPendingWrites,s.fromCache),this.query=r}get docs(){const e=[];return this.forEach((t=>e.push(t))),e}get size(){return this._snapshot.docs.size}get empty(){return this.size===0}forEach(e,t){this._snapshot.docs.forEach((r=>{e.call(t,new kr(this._firestore,this._userDataWriter,r.key,r,new Gn(this._snapshot.mutatedKeys.has(r.key),this._snapshot.fromCache),this.query.converter))}))}docChanges(e={}){const t=!!e.includeMetadataChanges;if(t&&this._snapshot.excludesMetadataChanges)throw new j(D.INVALID_ARGUMENT,"To include metadata changes with your document changes, you must also pass { includeMetadataChanges:true } to onSnapshot().");return this._cachedChanges&&this._cachedChangesIncludeMetadataChanges===t||(this._cachedChanges=(function(s,o){if(s._snapshot.oldDocs.isEmpty()){let a=0;return s._snapshot.docChanges.map((c=>{const h=new kr(s._firestore,s._userDataWriter,c.doc.key,c.doc,new Gn(s._snapshot.mutatedKeys.has(c.doc.key),s._snapshot.fromCache),s.query.converter);return c.doc,{type:"added",doc:h,oldIndex:-1,newIndex:a++}}))}{let a=s._snapshot.oldDocs;return s._snapshot.docChanges.filter((c=>o||c.type!==3)).map((c=>{const h=new kr(s._firestore,s._userDataWriter,c.doc.key,c.doc,new Gn(s._snapshot.mutatedKeys.has(c.doc.key),s._snapshot.fromCache),s.query.converter);let d=-1,p=-1;return c.type!==0&&(d=a.indexOf(c.doc.key),a=a.delete(c.doc.key)),c.type!==1&&(a=a.add(c.doc),p=a.indexOf(c.doc.key)),{type:jp(c.type),doc:h,oldIndex:d,newIndex:p}}))}})(this,t),this._cachedChangesIncludeMetadataChanges=t),this._cachedChanges}toJSON(){if(this.metadata.hasPendingWrites)throw new j(D.FAILED_PRECONDITION,"QuerySnapshot.toJSON() attempted to serialize a document with pending writes. Await waitForPendingWrites() before invoking toJSON().");const e={};e.type=cn._jsonSchemaVersion,e.bundleSource="QuerySnapshot",e.bundleName=pl.newId(),this._firestore._databaseId.database,this._firestore._databaseId.projectId;const t=[],r=[],s=[];return this.docs.forEach((o=>{o._document!==null&&(t.push(o._document),r.push(this._userDataWriter.convertObjectMap(o._document.data.value.mapValue.fields,"previous")),s.push(o.ref.path))})),e.bundle=(this._firestore,this.query._query,e.bundleName,"NOT SUPPORTED"),e}}function jp(n){switch(n){case 0:return"added";case 2:case 3:return"modified";case 1:return"removed";default:return H(61501,{type:n})}}cn._jsonSchemaVersion="firestore/querySnapshot/1.0",cn._jsonSchema={type:Pe("string",cn._jsonSchemaVersion),bundleSource:Pe("string","QuerySnapshot"),bundleName:Pe("string"),bundle:Pe("string")};class bc extends Bp{constructor(e){super(),this.firestore=e}convertBytes(e){return new Xe(e)}convertReference(e){const t=this.convertDocumentKey(e,this.firestore._databaseId);return new $e(this.firestore,null,t)}}function zp(n,...e){n=Xn(n);let t={includeMetadataChanges:!1,source:"default"},r=0;typeof e[r]!="object"||qa(e[r])||(t=e[r++]);const s={includeMetadataChanges:t.includeMetadataChanges,source:t.source};if(qa(e[r])){const h=e[r];e[r]=h.next?.bind(h),e[r+1]=h.error?.bind(h),e[r+2]=h.complete?.bind(h)}let o,a,c;if(n instanceof $e)a=Pr(n.firestore,si),c=gi(n._key.path),o={next:h=>{e[r]&&e[r]($p(a,n,h))},error:e[r+1],complete:e[r+2]};else{const h=Pr(n,qt);a=Pr(h.firestore,si),c=h._query;const d=new bc(a);o={next:p=>{e[r]&&e[r](new cn(a,d,h,p))},error:e[r+1],complete:e[r+2]},Op(n._query)}return(function(d,p,m,I){const R=new Ep(I),L=new sp(p,R,m);return d.asyncQueue.enqueueAndForget((async()=>ep(await Oa(d),L))),()=>{R.Nu(),d.asyncQueue.enqueueAndForget((async()=>tp(await Oa(d),L)))}})(Sp(a),c,s,o)}function $p(n,e,t){const r=t.docs.get(e._key),s=new bc(n);return new jt(n,s,e._key,r,new Gn(t.hasPendingWrites,t.fromCache),e.converter)}(function(e,t=!0){(function(s){_n=s})(Ch),Or(new Jn("firestore",((r,{instanceIdentifier:s,options:o})=>{const a=r.getProvider("app").getImmediate(),c=new si(new qh(r.getProvider("auth-internal")),new Kh(a,r.getProvider("app-check-internal")),(function(d,p){if(!Object.prototype.hasOwnProperty.apply(d.options,["projectId"]))throw new j(D.INVALID_ARGUMENT,'"projectId" not provided in firebase.initializeApp.');return new nr(d.options.projectId,p)})(a,s),a);return o={useFetchStreams:t,...o},c._setSettings(o),c}),"PUBLIC").setMultipleInstances(!0)),rn(Ko,Wo,e),rn(Ko,Wo,"esm2020")})();const qp={apiKey:"AIzaSyCjk0dG1CjZECHzwT9cr9S19XhnMnTYgmI",authDomain:"burkolmetal-726f3.firebaseapp.com",projectId:"burkolmetal-726f3",storageBucket:"burkolmetal-726f3.appspot.com",messagingSenderId:"271422310075",appId:"1:271422310075:web:0f466fc8deeed58f4d4b9e",measurementId:"G-25LT6XSH60"};let Ka,Hr;try{Ka=rl(qp),Hr=Ap(Ka),console.log("🔥 Firebase client initialized (production mode)"),console.log("💡 Recommendation: Use API endpoints instead of direct client calls")}catch(n){console.error("❌ Firebase client initialization failed:",n),Hr=null}const Rr=Qa||function(n,e="TL"){return`₺${(typeof n=="number"?n:parseFloat(n)||0).toFixed(2)}`};function Gp(n){const e=[{id:"date",label:"Tarih",type:"date"},{id:"name",label:"Müşteri",type:"text"},{id:"company",label:"Şirket",type:"text"},{id:"proj",label:"Proje",type:"text"},{id:"phone",label:"Telefon",type:"phone"},{id:"email",label:"E-posta",type:"email"}],r=(n?.fields||n?.formStructure?.fields||[]).filter(o=>o.display?.showInTable).sort((o,a)=>(o.display?.tableOrder||0)-(a.display?.tableOrder||0)),s=[{id:"price",label:"Tahmini Fiyat",type:"currency"},{id:"due",label:"Termine Kalan",type:"text"},{id:"status",label:"Durum",type:"text"}];return[...e,...r,...s]}function Hp(n,e){return["date","name","company","proj","phone","email","price","due","status"].includes(e)?e==="date"?n.createdAt||n.date||"":n[e]||"":n.customFields?.[e]||""}function Kp(n,e,t,r){if(n=(o=>o==null?"":Array.isArray(o)?o.join(", "):typeof o=="object"?JSON.stringify(o):o)(n),r){const{getPriceChangeType:o,setPriceReview:a,calculatePrice:c,statusLabel:h,t:d}=r;switch(e.id){case"date":return(n||"").slice(0,10);case"customer":return(t.name||"")+(t.company?" — "+t.company:"");case"project":const p=n||"";return p.length>15?p.substring(0,15)+"...":p;case"price":const m=o(t);return m==="no-change"?Rr(parseFloat(n)||0):E.createElement("div",{style:{display:"flex",alignItems:"center",gap:"8px"}},E.createElement("span",null,Rr(parseFloat(n)||0)),E.createElement("button",{onClick:L=>{L.stopPropagation();const z=parseFloat(t.price)||0;let F=z;t.pendingCalculatedPrice!==void 0?F=parseFloat(t.pendingCalculatedPrice)||0:typeof c=="function"&&(F=parseFloat(c(t))||0),a({item:t,originalPrice:z,newPrice:F})},style:{backgroundColor:m==="price-changed"?"#dc3545":"#ffc107",color:m==="price-changed"?"white":"#000",border:"none",padding:"2px 6px",borderRadius:"4px",fontSize:"10px",cursor:"pointer",fontWeight:"bold"},title:m==="price-changed"?"Fiyat değişti":"Formül değişti"},m==="price-changed"?"!":"~"));case"due":const I=n||"";return I.includes("Gecikti")?E.createElement("span",{style:{color:"#dc3545",fontWeight:"bold"}},I):I.includes("gün")&&parseInt(I.match(/\d+/)?.[0]||"0")<=3?E.createElement("span",{style:{color:"#ffc107",fontWeight:"bold"}},I):I;case"status":const R=h(n||"new",d);return E.createElement("span",{style:{padding:"2px 8px",borderRadius:"12px",fontSize:"11px",fontWeight:"bold",backgroundColor:Wp(n),color:Qp(n)}},R);default:return e.type==="currency"?Rr(parseFloat(n)||0):e.type==="email"?E.createElement("a",{href:`mailto:${n}`,style:{color:"#007bff"}},n):e.type==="phone"?E.createElement("a",{href:`tel:${n}`,style:{color:"#007bff"}},n):n||""}}return e.type==="currency"?Rr(parseFloat(n)||0):e.type==="date"?(n||"").slice(0,10):n||""}function Wp(n){switch(n){case"new":return"#e3f2fd";case"pending":return"#fff3e0";case"approved":return"#e8f5e8";case"rejected":return"#ffebee";case"completed":return"#f3e5f5";default:return"#f5f5f5"}}function Qp(n){switch(n){case"new":return"#1976d2";case"pending":return"#f57c00";case"approved":return"#388e3c";case"rejected":return"#d32f2f";case"completed":return"#7b1fa2";default:return"#666"}}function Ac(n,e){if(!e||!e.parameters||!e.formula)return n.calculatedPrice||n.price||0;try{const t={};e.parameters.forEach(a=>{if(!(!a||!a.id)){if(a.type==="fixed")t[a.id]=parseFloat(a.value)||0;else if(a.type==="form"){let c=0;if(a.formField==="qty")c=parseFloat(n.qty)||0;else if(a.formField==="thickness")c=parseFloat(n.thickness)||0;else if(a.formField==="dimensions"){const h=parseFloat(n.dimsL),d=parseFloat(n.dimsW);if(!isNaN(h)&&!isNaN(d))c=h*d;else{const p=n.dims||"",m=String(p).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);m&&(c=(parseFloat(m[1])||0)*(parseFloat(m[2])||0))}}else{let h=n[a.formField];if(h===void 0&&n.customFields&&(h=n.customFields[a.formField]),Array.isArray(h))h.forEach(d=>{if(a.lookupTable&&Array.isArray(a.lookupTable)){const p=a.lookupTable.find(m=>m.option===d);p&&(c+=parseFloat(p.value)||0)}});else if(a.lookupTable&&Array.isArray(a.lookupTable)){const d=a.lookupTable.find(p=>p.option===h);d?c=parseFloat(d.value)||0:c=parseFloat(h)||0}else c=parseFloat(h)||0}t[a.id]=c}}}),console.log("🔍 PRICE CALCULATION DEBUG:",{quoteId:n.id,paramValues:t,originalFormula:e.formula,customFields:n.customFields});let r=e.formula;if(Object.keys(t).sort((a,c)=>c.length-a.length).forEach(a=>{const c=new RegExp("\\b"+a+"\\b","g");r=r.replace(c,t[a])}),console.log("🔍 FORMULA AFTER REPLACEMENT:",r),r.startsWith("=")&&(r=r.substring(1),console.log("🔍 FORMULA AFTER = REMOVAL:",r)),!/^[\d\s+\-*/().]+$/.test(r))return console.warn("❌ Invalid formula characters detected:",r),n.calculatedPrice||n.price||0;const o=Function('"use strict"; return ('+r+")")();return isNaN(o)?0:Math.max(0,o)}catch(t){return console.error("Price calculation error:",t),n.calculatedPrice||n.price||0}}function Yp(n,e){try{const t=n.price||0,r=Ac(n,e);return Math.abs(r-t)>.01?"price-changed":n.needsPriceUpdate===!0||n.calculatedPrice!==void 0&&Math.abs(r-n.calculatedPrice)>.01?"formula-changed":"no-change"}catch(t){return console.error("Price change type calculation error:",t),"no-change"}}function Xp(n,e){const t=[];if(!n.priceHistory||!Array.isArray(n.priceHistory))return t;const r=n.priceHistory[n.priceHistory.length-1];if(!r)return t;if(["qty","thickness","material","process","finish","dims"].forEach(o=>{const a=n[o],c=r.quoteSnapshot?.[o];JSON.stringify(a)!==JSON.stringify(c)&&t.push({field:o,from:c,to:a})}),r.priceSettings){const o=e?.formula,a=r.priceSettings.formula;o!==a&&t.push({field:"formula",from:a,to:o});const c=e?.parameters||[],h=r.priceSettings.parameters||[];JSON.stringify(c)!==JSON.stringify(h)&&t.push({field:"parameters",from:h,to:c})}return t}function Jp(n,e,t=null){function r(a){if(t&&t.formStructure&&t.formStructure.fields){const c=t.formStructure.fields.find(h=>h.id===a);if(c&&c.label)return c.label}return a}if(Array.isArray(n.priceUpdateReasons)&&n.priceUpdateReasons.length>0)return n.priceUpdateReasons.join("; ");if(n.formStructureChanged===!0)return"User form güncellendi";const s=Xp(n,e);if(s.length===0)return n.priceUpdateReason==="Form structure changed"||n.previousFormVersion!==void 0?"User form güncellendi":"Fiyat güncelleme gerekli (sebep belirtilmemiş)";const o=[];return s.forEach(a=>{switch(a.field){case"qty":o.push(`Adet değişti: ${a.from} → ${a.to}`);break;case"thickness":o.push(`Kalınlık değişti: ${a.from} → ${a.to}`);break;case"material":o.push(`Malzeme değişti: ${a.from} → ${a.to}`);break;case"process":const c=Array.isArray(a.from)?a.from.join(", "):a.from,h=Array.isArray(a.to)?a.to.join(", "):a.to;o.push(`İşlem türü değişti: ${c} → ${h}`);break;case"finish":o.push(`Yüzey işlemi değişti: ${a.from} → ${a.to}`);break;case"dims":o.push(`Boyutlar değişti: ${a.from} → ${a.to}`);break;case"formula":o.push("Fiyat formülü güncellendi");break;case"parameters":o.push("Fiyat parametreleri güncellendi");break;default:const d=r(a.field);o.push(`${d} değişti`)}}),o.join("; ")}async function Zp(n,e,t){try{const r=await e.applyNewPrice(n.id);return r?(t("Fiyat güncellendi!","success"),r):(t("Fiyat güncellenirken hata oluştu","error"),null)}catch(r){return console.error("Price update error:",r),t("Fiyat güncellenirken hata oluştu","error"),null}}const{useMemo:Sc}=E;function em(n,e,t,r){return Sc(()=>n.filter(s=>{if(t){const o=t.toLowerCase(),a=[s.name,s.company,s.proj,s.email,s.phone,s.material,s.finish,s.status,s.country,s.dims,s.dimsL,s.dimsW,s.thickness,s.qty,s.notes,s.createdBy,s.price,s.calculatedPrice],c=Array.isArray(s.process)?s.process:[s.process].filter(Boolean),h=s.customFields?Object.values(s.customFields):[],d=s.files?s.files.map(m=>m.name||m.originalName||""):[];if(![...a,...c,...h,...d].filter(Boolean).join(" ").toLowerCase().includes(o))return!1}if(e.status&&e.status.length>0&&!e.status.includes(s.status))return!1;if(r&&r.steps){for(const o of r.steps)for(const a of o.fields)if(a.filterable&&e[a.id]&&e[a.id].length>0){const c=s[a.id];if(a.type==="multiselect"){const h=Array.isArray(c)?c:typeof c=="string"?c.split(",").map(p=>p.trim()):[];if(!e[a.id].some(p=>h.includes(p)))return!1}else if(!e[a.id].includes(c))return!1}}if(e.dateRange&&(e.dateRange.from||e.dateRange.to)){const o=new Date(s.createdAt);if(e.dateRange.from){const a=new Date(e.dateRange.from);if(o<a)return!1}if(e.dateRange.to){const a=new Date(e.dateRange.to);if(a.setHours(23,59,59,999),o>a)return!1}}if(e.qtyRange&&(e.qtyRange.min||e.qtyRange.max)){const o=parseFloat(s.qty)||0;if(e.qtyRange.min&&o<parseFloat(e.qtyRange.min)||e.qtyRange.max&&o>parseFloat(e.qtyRange.max))return!1}return!0}),[n,e,t])}function tm(n,e){return Sc(()=>{const t={status:[...new Set(n.map(r=>r.status).filter(Boolean))]};return e&&e.steps&&e.steps.forEach(r=>{r.fields.forEach(s=>{s.filterable&&s.type!=="textarea"&&s.type!=="date"&&s.type!=="number"&&(s.type==="multiselect"?t[s.id]=[...new Set(n.flatMap(o=>Array.isArray(o[s.id])?o[s.id]:typeof o[s.id]=="string"?o[s.id].split(",").map(a=>a.trim()):[]).filter(Boolean))]:s.type==="radio"&&s.options?t[s.id]=[...new Set(n.map(o=>o[s.id]).filter(Boolean))]:t[s.id]=[...new Set(n.map(o=>o[s.id]).filter(Boolean))])})}),t},[n,e])}function nm(n,e,t,r,s="toggle"){e(o=>{const a={...o};if(t==="dateRange"||t==="qtyRange")a[t]={...o[t],...r};else{const c=o[t]||[];s==="toggle"?c.includes(r)?a[t]=c.filter(h=>h!==r):a[t]=[...c,r]:s==="add"?c.includes(r)||(a[t]=[...c,r]):s==="remove"&&(a[t]=c.filter(h=>h!==r))}return a})}function rm(n,e){n({status:[],material:[],process:[],dateRange:{from:"",to:""},qtyRange:{min:"",max:""},country:[]}),e("")}function sm(n,e){n(t=>{const r={...t};return r[e]=[],r})}function ks(n){let e=0;return Object.keys(n).forEach(t=>{(Array.isArray(n[t])&&n[t].length>0||t==="dateRange"&&(n[t].from||n[t].to)||t==="qtyRange"&&(n[t].min||n[t].max))&&e++}),e}function Wa(n,e="count"){const t={total:n.length,byStatus:{},byMaterial:{},byProcess:{},byMonth:{},totalValue:0,avgValue:0};let r=0;n.forEach(o=>{const a=parseFloat(o.price)||0;r+=a}),t.totalValue=r,t.avgValue=n.length>0?r/n.length:0,n.forEach(o=>{const a=o.status||"unknown";t.byStatus[a]||(t.byStatus[a]={count:0,value:0}),t.byStatus[a].count++,t.byStatus[a].value+=parseFloat(o.price)||0}),n.forEach(o=>{const a=o.material||"unknown";t.byMaterial[a]||(t.byMaterial[a]={count:0,value:0}),t.byMaterial[a].count++,t.byMaterial[a].value+=parseFloat(o.price)||0}),n.forEach(o=>{const a=Array.isArray(o.process)?o.process:[o.process].filter(Boolean);a.forEach(c=>{t.byProcess[c]||(t.byProcess[c]={count:0,value:0}),t.byProcess[c].count++,t.byProcess[c].value+=(parseFloat(o.price)||0)/a.length})}),n.forEach(o=>{const c=(o.createdAt||o.date||"").slice(0,7);c&&(t.byMonth[c]||(t.byMonth[c]={count:0,value:0}),t.byMonth[c].count++,t.byMonth[c].value+=parseFloat(o.price)||0)});const s=o=>Object.entries(o).map(([a,c])=>({label:a,count:c.count,value:c.value})).sort((a,c)=>e==="value"?c.value-a.value:c.count-a.count);return t.byStatus=s(t.byStatus),t.byMaterial=s(t.byMaterial),t.byProcess=s(t.byProcess),t.byMonth=s(t.byMonth).sort((o,a)=>o.label.localeCompare(a.label)),t}function Ns({data:n,xLabel:e,yLabel:t,byKeyAlpha:r=!1}){if(!n||n.length===0)return E.createElement("div",{style:{padding:"20px",textAlign:"center",color:"#666",border:"1px solid #ddd",borderRadius:"4px",backgroundColor:"#f9f9f9"}},"Veri bulunamadı");const s=r?[...n].sort((p,m)=>p.label.localeCompare(m.label)):n,o=Math.max(...s.map(p=>t.includes("Toplam")?p.value:p.count)),a=200,c=400,h={top:20,right:20,bottom:60,left:60},d=Math.max(20,(c-h.left-h.right)/s.length-10);return E.createElement("div",{style:{border:"1px solid #ddd",borderRadius:"8px",padding:"16px",backgroundColor:"white"}},E.createElement("h4",{style:{margin:"0 0 16px 0",fontSize:"14px",color:"#333",textAlign:"center"}},`${e} - ${t}`),E.createElement("div",{style:{position:"relative",height:a+h.top+h.bottom,overflow:"auto"}},E.createElement("svg",{width:Math.max(c,s.length*(d+10)+h.left+h.right),height:a+h.top+h.bottom,style:{display:"block"}},E.createElement("line",{x1:h.left,y1:h.top,x2:h.left,y2:a+h.top,stroke:"#333",strokeWidth:1}),E.createElement("line",{x1:h.left,y1:a+h.top,x2:s.length*(d+10)+h.left,y2:a+h.top,stroke:"#333",strokeWidth:1}),...s.map((p,m)=>{const I=t.includes("Toplam")?p.value:p.count,R=o>0?I/o*a:0,L=h.left+m*(d+10)+5,z=h.top+a-R;return E.createElement("g",{key:p.label},E.createElement("rect",{x:L,y:z,width:d,height:R,fill:im(m),stroke:"#333",strokeWidth:1}),E.createElement("text",{x:L+d/2,y:z-5,textAnchor:"middle",fontSize:"10px",fill:"#333"},t.includes("Toplam")?Qa(I):I),E.createElement("text",{x:L+d/2,y:a+h.top+15,textAnchor:"middle",fontSize:"10px",fill:"#333",transform:`rotate(-45, ${L+d/2}, ${a+h.top+15})`},p.label.length>10?p.label.substring(0,10)+"...":p.label))}),E.createElement("text",{x:15,y:h.top+a/2,textAnchor:"middle",fontSize:"12px",fill:"#333",transform:`rotate(-90, 15, ${h.top+a/2})`},t))))}function im(n){const e=["#007bff","#28a745","#ffc107","#dc3545","#6c757d","#17a2b8","#fd7e14","#e83e8c","#6f42c1","#20c997"];return e[n%e.length]}const{useState:_e,useEffect:oi,useMemo:gm}=E;function om(n,e){let t=n;return e&&e.formStructure&&e.formStructure.fields&&e.formStructure.fields.forEach(r=>{const s=new RegExp(r.id,"g");t=t.replace(s,r.label||r.id)}),t=t.replace(/([^→]+)→([^;,]+)/g,'<span style="background-color: #ffebee; color: #c62828; padding: 2px 4px; border-radius: 3px;">$1</span>→<span style="background-color: #e8f5e8; color: #2e7d32; padding: 2px 4px; border-radius: 3px;">$2</span>'),t}function am({t:n,onLogout:e,showNotification:he,SettingsModal:r,DetailModal:s,FilterPopup:o}){const[a,c]=_e([]),[h,d]=_e(null),[p,m]=_e(!1),[I,R]=_e(new Set),[L,z]=_e(!1),[F,X]=_e(null),[oe,ie]=_e("count"),[xe,Se]=_e(!1),[me,w]=_e(""),[g,_]=_e(null),[T,v]=_e({}),[b,y]=_e(!1),[ve,Ke]=_e(null),[Qe,Vt]=_e({currentPage:1,itemsPerPage:10,totalItems:0}),[Ze,dt]=_e("quotes"),[In,Gt]=_e([]),[Ht,C]=_e(!1),[M,O]=_e({email:"",password:"",role:"admin"}),[x,$]=_e({status:[],dateRange:{from:"",to:""},qtyRange:{min:"",max:""}}),[ce,ae]=_e(!0),[et,we]=_e(null);oi(()=>{if(ae(!0),we(null),!Hr){we("Firebase bağlantısı kurulamadı. Lütfen sayfayı yenileyin."),ae(!1);return}try{const V=bp(Hr,"quotes"),W=Lp(V,Up("createdAt","desc")),ye=zp(W,qe=>{const tt=qe.docs.map(Sn=>({id:Sn.id,...Sn.data()}));c(tt),ae(!1),we(null)},qe=>{console.error("Firestore listener error:",qe),qe.code==="permission-denied"?we("Firebase erişim izni reddedildi. Lütfen yönetici ile iletişime geçin."):qe.code==="unavailable"?we("Firebase servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin."):we(`Veri yükleme hatası: ${qe.message}`),ae(!1)});return()=>ye()}catch(V){console.error("Firebase query error:",V),we("Veritabanı sorgusu başlatılamadı."),ae(!1)}},[]),oi(()=>{J(),k(),Ze==="users"&&bn()},[Ze]);async function Le(){console.log("🔧 DEBUG: refresh() called");try{console.log("🔄 Syncing localStorage quotes to Firebase...");const V=await Ne.syncLocalQuotesToFirebase();V.synced>0&&(console.log("✅ Synced",V.synced,"localStorage quotes to Firebase"),he(`Synced ${V.synced} local quotes to database`,"success")),console.log("🔧 DEBUG: Calling API.listQuotes()...");const W=await Ne.listQuotes();console.log("🔧 DEBUG: API.listQuotes() returned:",W.length,"quotes"),c(W),console.log("🔧 DEBUG: setList() called with quotes"),await J(),await k(),Ze==="users"&&await bn(),console.log("🔧 DEBUG: refresh() completed successfully")}catch(V){console.error("🔧 DEBUG: refresh() error:",V)}}async function ge(V){console.log("🔧 DEBUG: handleAddRecord called with:",V);try{console.log("🔧 DEBUG: Calling API.addQuote...");const W=await Ne.addQuote(V);console.log("🔧 DEBUG: API.addQuote result:",W),console.log("🔧 DEBUG: Refreshing list..."),await Le(),console.log("🔧 DEBUG: Showing success notification..."),he("Kayıt başarıyla eklendi","success"),console.log("🔧 DEBUG: Add record completed successfully")}catch(W){console.error("🔧 DEBUG: Error adding record:",W),he("Kayıt eklenirken hata oluştu: "+W.message,"error")}}function he(V,W="info"){Ke({message:V,type:W}),setTimeout(()=>{Ke(null)},3e3)}async function bn(){try{const V=await Ne.listUsers();Gt(V)}catch(V){console.error("Users load error:",V),he("Kullanıcılar yüklenemedi","error")}}async function J(){try{if(typeof Ne.getPriceSettings!="function"){console.warn("API.getPriceSettings is not available, using defaults"),v({currency:"USD",margin:20,discountThreshold:1e3,discountPercent:5});return}const V=await Ne.getPriceSettings();v(V)}catch(V){console.error("Price settings load error:",V),v({currency:"USD",margin:20,discountThreshold:1e3,discountPercent:5})}}async function k(){try{const V=await Ne.getFormConfig();_(V.formConfig)}catch(V){console.error("Form config load error:",V)}}async function Q(){try{await Ne.logout(),e()}catch(V){console.error("Logout error:",V),e()}}const B=em(a,x,me,g),K=tm(a,g),de=B.length,Ye=Math.ceil(de/Qe.itemsPerPage),Dt=(Qe.currentPage-1)*Qe.itemsPerPage,An=Dt+Qe.itemsPerPage,kt=B.slice(Dt,An);E.useEffect(()=>{Vt(V=>({...V,totalItems:de}))},[de]);const Kt=Wa(a,oe);Wa(B,oe);function Wt(){return oe==="value"?"Toplam Değer (₺)":"Adet"}async function Qt(V,W){await Ne.updateStatus(V,W),Le(),he("Kayıt durumu güncellendi!","success")}async function is(V){await Ne.remove(V),Le()}function os(V,W){R(ye=>{const qe=new Set(ye);return W?qe.add(V):qe.delete(V),qe})}function cr(V){R(V?new Set(B.map(W=>W.id)):new Set)}async function ur(){if(!F)return;await Zp(F.item,Ne,he)&&(Le(),X(null))}const ft=Gp(g);return E.createElement("div",{className:"admin-panel"},ve&&E.createElement("div",{style:{position:"fixed",top:"20px",left:"50%",transform:"translateX(-50%)",backgroundColor:ve.type==="success"?"#4caf50":ve.type==="error"?"#f44336":"#2196f3",color:"white",padding:"12px 24px",borderRadius:"8px",boxShadow:"0 4px 12px rgba(0,0,0,0.15)",zIndex:1e4,fontSize:"14px",fontWeight:"500",maxWidth:"400px",textAlign:"center",animation:"slideInDown 0.3s ease-out"}},ve.message),E.createElement("div",{className:"header",style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}},E.createElement("h1",null,n.a_title||"Admin Panel"),E.createElement("div",{style:{display:"flex",gap:"10px"}},E.createElement("a",{href:"./settings.html",className:"btn",style:{backgroundColor:"#007bff",color:"white",border:"none",padding:"8px 12px",borderRadius:"6px",cursor:"pointer",fontSize:"16px",transition:"all 0.2s ease",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:"5px"},onMouseOver:V=>V.target.style.backgroundColor="#0056b3",onMouseOut:V=>V.target.style.backgroundColor="#007bff",title:"Sistem Ayarları"},"⚙️ Ayarlar"),E.createElement("button",{onClick:Q,className:"btn",style:{backgroundColor:"#ff3b30",color:"white",border:"none",padding:"8px 16px",borderRadius:"6px",cursor:"pointer"}},n.logout_btn||"Çıkış Yap"))),E.createElement("div",{className:"card",style:{marginBottom:12}},E.createElement("label",null,n.a_charts),E.createElement("div",{className:"row wrap",style:{gap:12,marginTop:6,display:"flex",flexWrap:"wrap",justifyContent:"space-between"}},E.createElement("div",{style:{flex:"1 1 calc(33.333% - 8px)",minWidth:250,maxWidth:"100%"}},E.createElement(Ns,{data:Kt.byStatus,xLabel:n.dim_status,yLabel:Wt(),byKeyAlpha:!1})),E.createElement("div",{style:{flex:"1 1 calc(33.333% - 8px)",minWidth:250,maxWidth:"100%"}},E.createElement(Ns,{data:Kt.byProcess,xLabel:n.dim_process,yLabel:Wt(),byKeyAlpha:!1})),E.createElement("div",{style:{flex:"1 1 calc(33.333% - 8px)",minWidth:250,maxWidth:"100%"}},E.createElement(Ns,{data:Kt.byMaterial,xLabel:n.dim_material,yLabel:Wt(),byKeyAlpha:!1})))),E.createElement("div",{className:"card",style:{marginTop:16}},E.createElement("div",{className:"row",style:{justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"12px"}},E.createElement("label",{style:{fontSize:"16px",fontWeight:"600",margin:0,minWidth:"120px"}},n.a_list),E.createElement("div",{style:{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}},E.createElement("input",{type:"text",placeholder:"Tüm veriler içinde arama...",value:me,onChange:V=>w(V.target.value),style:{padding:"6px 12px",border:"1px solid #ddd",borderRadius:"4px",minWidth:"200px"}}),E.createElement("button",{onClick:()=>Se(!0),className:"btn",style:{backgroundColor:ks(x)>0?"#28a745":"#6c757d",color:"white",border:"none",padding:"6px 12px",borderRadius:"4px",cursor:"pointer",position:"relative"}},"🔍 Filtreler",ks(x)>0&&E.createElement("span",{style:{position:"absolute",top:"-6px",right:"-6px",backgroundColor:"#dc3545",color:"white",borderRadius:"50%",width:"20px",height:"20px",fontSize:"11px",display:"flex",alignItems:"center",justifyContent:"center"}},ks(x))),E.createElement("button",{onClick:()=>rm($,w),className:"btn",style:{backgroundColor:"#dc3545",color:"white",border:"none",padding:"6px 12px",borderRadius:"4px",cursor:"pointer"}},"Temizle"),E.createElement("button",{onClick:()=>{console.log("🔧 DEBUG: Kayıt Ekle button clicked"),y(!0),console.log("🔧 DEBUG: showAddModal set to true")},className:"btn",style:{backgroundColor:"#28a745",color:"white",border:"none",padding:"6px 12px",borderRadius:"4px",cursor:"pointer"}},"Kayıt Ekle"),(function(){const V=I.size,W=a.filter(tt=>tt.needsPriceUpdate).length;if(V===0&&W===0)return null;const ye=V>0?"Seçilen kayıtların fiyatlarını güncelle":"Tümü güncelle",qe=async()=>{try{V>0?await Ne.applyPricesBulk(Array.from(I)):await Ne.applyPricesAll(),R(new Set),await Le(),he("Fiyatlar güncellendi","success")}catch(tt){console.error("Bulk update error",tt),he("Toplu fiyat güncelleme başarısız","error")}};return E.createElement("button",{onClick:qe,className:"btn",style:{backgroundColor:"#17a2b8",color:"white",border:"none",padding:"6px 12px",borderRadius:"4px",cursor:"pointer"}},ye)})())),E.createElement("div",{style:{marginTop:"12px",display:"flex",flexWrap:"wrap",gap:"8px"}},x.status.length>0&&E.createElement("span",{style:{backgroundColor:"#007bff",color:"white",padding:"4px 8px",borderRadius:"16px",fontSize:"11px",position:"relative",cursor:"pointer",transition:"all 0.2s ease",paddingRight:"20px"},onMouseOver:V=>V.target.style.backgroundColor="#0056b3",onMouseOut:V=>V.target.style.backgroundColor="#007bff",title:"Durum filtresini kaldır"},`Durum: ${x.status.join(", ")}`,E.createElement("span",{style:{position:"absolute",right:"4px",top:"50%",transform:"translateY(-50%)",cursor:"pointer",fontWeight:"bold",fontSize:"12px"},onClick:V=>{V.stopPropagation(),sm($,"status")}},"×"))),E.createElement("div",{style:{marginTop:"12px",fontSize:"14px",color:"#666"}},`${B.length} kayıt gösteriliyor${B.length!==a.length?` (toplam ${a.length} kayıttan)`:""}`)),E.createElement("div",{className:"table-container",style:{marginTop:"16px",overflowX:"auto"}},E.createElement("table",{className:"table"},E.createElement("thead",null,E.createElement("tr",null,E.createElement("th",null,E.createElement("input",{type:"checkbox",checked:I.size===B.length&&B.length>0,onChange:V=>cr(V.target.checked),onClick:V=>V.stopPropagation()})),...ft.map(V=>E.createElement("th",{key:V.id},V.label)),E.createElement("th",null,"İşlemler"))),E.createElement("tbody",null,kt.map(V=>E.createElement("tr",{key:V.id,onClick:()=>d(V),style:{cursor:"pointer"}},E.createElement("td",null,E.createElement("input",{type:"checkbox",checked:I.has(V.id),onChange:W=>{W.stopPropagation(),os(V.id,W.target.checked)},onClick:W=>W.stopPropagation()})),...ft.map(W=>E.createElement("td",{key:W.id},Kp(Hp(V,W.id),W,V,{getPriceChangeType:ye=>Yp(ye,T),setPriceReview:X,calculatePrice:ye=>Ac(ye,T),statusLabel:Qc,t:n}))),E.createElement("td",null,E.createElement("div",{style:{display:"flex",gap:"4px"}},E.createElement("button",{onClick:W=>{W.stopPropagation(),d(V)},className:"btn btn-sm",style:{fontSize:"12px",padding:"2px 6px"}},"Detay"),E.createElement("button",{onClick:W=>{W.stopPropagation(),is(V.id)},className:"btn btn-sm btn-danger",style:{fontSize:"12px",padding:"2px 6px"}},"Sil")))))))),Ye>1&&E.createElement("div",{className:"pagination-container",style:{display:"flex",justifyContent:"center",alignItems:"center",gap:"10px",marginTop:"20px",padding:"20px 0"}},E.createElement("button",{onClick:()=>Vt(V=>({...V,currentPage:Math.max(1,V.currentPage-1)})),disabled:Qe.currentPage===1,className:"btn btn-sm",style:{padding:"5px 10px"}},"← Önceki"),E.createElement("span",{style:{color:"var(--text)",fontSize:"14px",margin:"0 15px"}},`Sayfa ${Qe.currentPage} / ${Ye} (${de} kayıt)`),E.createElement("button",{onClick:()=>Vt(V=>({...V,currentPage:Math.min(Ye,V.currentPage+1)})),disabled:Qe.currentPage===Ye,className:"btn btn-sm",style:{padding:"5px 10px"}},"Sonraki →"),E.createElement("select",{value:Qe.itemsPerPage,onChange:V=>Vt(W=>({...W,itemsPerPage:parseInt(V.target.value),currentPage:1})),style:{marginLeft:"20px",padding:"5px",borderRadius:"4px",border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"var(--text)"}},E.createElement("option",{value:5},"5 kayıt"),E.createElement("option",{value:10},"10 kayıt"),E.createElement("option",{value:25},"25 kayıt"),E.createElement("option",{value:50},"50 kayıt"))),L&&E.createElement(r,{onClose:()=>z(!1),onSettingsUpdated:Le,t:n,showNotification:he}),h&&E.createElement(s,{item:h,onClose:()=>d(null),setItemStatus:Qt,onSaved:Le,formConfig:g,t:n,showNotification:he}),xe&&E.createElement(o,{filters:x,filterOptions:K,formConfig:g,onFilterChange:(V,W,ye)=>nm(x,$,V,W,ye),onClose:()=>Se(!1),t:n}),F&&F.item&&E.createElement("div",{className:"modal-overlay",onClick:()=>X(null),style:{position:"fixed",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1e3}},E.createElement("div",{className:"card detail-modal",onClick:V=>V.stopPropagation(),style:{width:"min(500px, 90vw)",maxHeight:"85vh",overflowY:"auto",position:"relative",padding:"20px",margin:"20px"}},E.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px",paddingBottom:"10px",borderBottom:"1px solid rgba(255,255,255,0.1)"}},E.createElement("h3",{style:{margin:0}},"Fiyat Güncelleme"),E.createElement("button",{onClick:()=>X(null),style:{background:"none",border:"none",color:"#888",fontSize:"24px",cursor:"pointer",padding:"0",width:"30px",height:"30px",display:"flex",alignItems:"center",justifyContent:"center"}},"×")),E.createElement("div",{style:{marginBottom:"20px"}},E.createElement("p",{style:{margin:"8px 0"}},`Müşteri: ${F.item.name||"N/A"}`),E.createElement("p",{style:{margin:"8px 0"}},`Proje: ${F.item.proj||"N/A"}`),E.createElement("p",{style:{margin:"8px 0"}},`Mevcut Fiyat: ${Number.isFinite(Number(F.originalPrice))?`₺${Number(F.originalPrice).toFixed(2)}`:"N/A"}`),E.createElement("p",{style:{margin:"8px 0"}},`Yeni Fiyat: ${Number.isFinite(Number(F.newPrice))?`₺${Number(F.newPrice).toFixed(2)}`:"N/A"}`),E.createElement("div",{style:{margin:"8px 0"}},[E.createElement("span",{key:"label"},"Değişiklik Nedeni: "),E.createElement("span",{key:"reason",style:{fontFamily:"monospace"},dangerouslySetInnerHTML:{__html:om(Jp(F.item,T,g)||"N/A",g)}})])),E.createElement("div",{style:{display:"flex",gap:"10px",justifyContent:"flex-end",borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:"15px"}},E.createElement("button",{onClick:()=>X(null),className:"btn btn-secondary"},"İptal"),E.createElement("button",{onClick:ur,className:"btn btn-primary"},"Fiyatı Güncelle")))),E.createElement(lm,{isOpen:b,onClose:()=>y(!1),formConfig:g,onSave:ge}))}function lm({isOpen:n,onClose:e,formConfig:t,onSave:r}){const[s,o]=_e({}),[a,c]=_e(!1);console.log("🔧 DEBUG: AddRecordModal render - isOpen:",n,"formConfig:",!!t),oi(()=>{if(n&&t){const m={name:"",email:"",phone:"",company:"",proj:"",status:"new",createdAt:new Date().toISOString(),customFields:{}};t.formStructure&&t.formStructure.fields&&t.formStructure.fields.forEach(I=>{I.type==="multiselect"||I.type==="checkbox"?m.customFields[I.id]=[]:(I.type,m.customFields[I.id]="")}),o(m)}},[n,t]);function h(m,I,R){["name","email","phone","company","proj"].includes(m)?o(z=>({...z,[m]:I})):o(z=>({...z,customFields:{...z.customFields,[m]:R==="multiselect"&&typeof I=="string"?I.split(",").map(F=>F.trim()).filter(Boolean):I}}))}async function d(){if(!a){c(!0);try{const m={...s,createdAt:new Date().toISOString(),status:s.status||"new"};console.log("🔧 DEBUG: Submitting record data:",m),await r(m),console.log("🔧 DEBUG: Record saved successfully"),e(),o({})}catch(m){console.error("🔧 DEBUG: Error saving record:",m),alert("Kayıt kaydedilirken hata oluştu: "+m.message)}finally{c(!1)}}}function p(m){const I=s.customFields?.[m.id]||"";switch(m.type){case"textarea":return E.createElement("textarea",{value:I,onChange:R=>h(m.id,R.target.value,m.type),style:{width:"100%",minHeight:"80px",padding:"8px",border:"1px solid #ddd",borderRadius:"4px",resize:"vertical"},placeholder:m.label});case"radio":return E.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"8px"}},...(m.options||[]).map(R=>E.createElement("label",{key:R,style:{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer"}},E.createElement("input",{type:"radio",name:m.id,value:R,checked:I===R,onChange:L=>h(m.id,L.target.value,m.type)}),R)));case"multiselect":return E.createElement("input",{type:"text",value:Array.isArray(I)?I.join(", "):I,onChange:R=>h(m.id,R.target.value,m.type),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:`${m.label} (virgülle ayırın)`});case"number":return E.createElement("input",{type:"number",value:I,onChange:R=>h(m.id,parseFloat(R.target.value)||0,m.type),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:m.label});case"date":return E.createElement("input",{type:"date",value:I,onChange:R=>h(m.id,R.target.value,m.type),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"}});case"email":return E.createElement("input",{type:"email",value:I,onChange:R=>h(m.id,R.target.value,m.type),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:m.label});default:return E.createElement("input",{type:"text",value:I,onChange:R=>h(m.id,R.target.value,m.type),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:m.label})}}return n?(console.log("🔧 DEBUG: AddRecordModal rendering modal content"),E.createElement("div",{style:{position:"fixed",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1e3},onClick:e},E.createElement("div",{className:"card detail-modal",style:{width:"min(600px, 90vw)",maxHeight:"85vh",overflowY:"auto",position:"relative",padding:"20px",margin:"20px"},onClick:m=>m.stopPropagation()},E.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px",paddingBottom:"10px",borderBottom:"1px solid rgba(255,255,255,0.1)"}},E.createElement("h3",{style:{margin:0}},"Yeni Kayıt Ekle"),E.createElement("button",{onClick:e,className:"btn",style:{background:"none",border:"none",fontSize:"20px",cursor:"pointer",color:"#999"}},"×")),E.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"20px"}},E.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},E.createElement("label",{style:{fontWeight:"bold",fontSize:"14px",color:"#333"}},"Müşteri Adı *"),E.createElement("input",{type:"text",value:s.name||"",onChange:m=>h("name",m.target.value),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:"Müşteri adı"})),E.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},E.createElement("label",{style:{fontWeight:"bold",fontSize:"14px",color:"#333"}},"E-posta *"),E.createElement("input",{type:"email",value:s.email||"",onChange:m=>h("email",m.target.value),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:"E-posta adresi"})),E.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},E.createElement("label",{style:{fontWeight:"bold",fontSize:"14px",color:"#333"}},"Telefon"),E.createElement("input",{type:"tel",value:s.phone||"",onChange:m=>h("phone",m.target.value),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:"Telefon numarası"})),E.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},E.createElement("label",{style:{fontWeight:"bold",fontSize:"14px",color:"#333"}},"Şirket"),E.createElement("input",{type:"text",value:s.company||"",onChange:m=>h("company",m.target.value),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:"Şirket adı"})),E.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}},E.createElement("label",{style:{fontWeight:"bold",fontSize:"14px",color:"#333"}},"Proje"),E.createElement("input",{type:"text",value:s.proj||"",onChange:m=>h("proj",m.target.value),style:{width:"100%",padding:"8px",border:"1px solid #ddd",borderRadius:"4px"},placeholder:"Proje adı"})),...t&&t.formStructure&&t.formStructure.fields?t.formStructure.fields.map(m=>E.createElement("div",{key:m.id,style:{display:"flex",flexDirection:"column",gap:"6px"}},E.createElement("label",{style:{fontWeight:"bold",fontSize:"14px",color:"#333"}},m.label+(m.required?" *":"")),p(m))):[]),E.createElement("div",{style:{display:"flex",justifyContent:"flex-end",gap:"10px",marginTop:"20px",paddingTop:"20px",borderTop:"1px solid rgba(255,255,255,0.1)"}},E.createElement("button",{onClick:e,className:"btn",style:{padding:"10px 20px",backgroundColor:"#6c757d",color:"white",border:"none",borderRadius:"4px",cursor:"pointer"}},"İptal"),E.createElement("button",{onClick:d,disabled:a,className:"btn",style:{padding:"10px 20px",backgroundColor:a?"#999":"#28a745",color:"white",border:"none",borderRadius:"4px",cursor:a?"not-allowed":"pointer"}},a?"Kaydediliyor...":"Kaydet"))))):(console.log("🔧 DEBUG: AddRecordModal not rendering - isOpen is false"),null)}function cm({message:n,type:e="success",onClose:t}){const r={position:"fixed",top:"20px",left:"50%",transform:"translateX(-50%)",backgroundColor:e==="success"?"#28a745":e==="error"?"#dc3545":e==="warning"?"#ffc107":"#17a2b8",color:e==="warning"?"#212529":"white",padding:"12px 20px",borderRadius:"8px",boxShadow:"0 4px 12px rgba(0,0,0,0.3)",zIndex:9999,minWidth:"300px",maxWidth:"500px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:"14px",fontWeight:"500",animation:"slideInDown 0.3s ease-out"};return E.createElement("div",{style:r},E.createElement("span",null,n),E.createElement("button",{onClick:t,style:{background:"none",border:"none",color:"inherit",fontSize:"16px",fontWeight:"bold",cursor:"pointer",marginLeft:"12px",padding:"0 4px",opacity:.8},onMouseOver:s=>s.target.style.opacity="1",onMouseOut:s=>s.target.style.opacity="0.8"},"×"))}function um(){const[n,e]=E.useState([]);return{notifications:n,showNotification:(s,o="success",a=4e3)=>{const c=Date.now()+Math.random(),h={id:c,message:s,type:o};e(d=>[...d,h]),setTimeout(()=>{e(d=>d.filter(p=>p.id!==c))},a)},removeNotification:s=>{e(o=>o.filter(a=>a.id!==s))}}}const ai=window.location.pathname.includes("panel-gizli.html")?"admin":"quote";function hm({onLang:n,lang:e,t}){const r=ai==="admin";return re.jsx("div",{className:"nav",children:re.jsxs("div",{className:"nav-inner container",children:[re.jsxs("div",{className:"brand",children:[re.jsx("div",{className:"dot"}),re.jsx("a",{href:r?"./panel-gizli.html":"./index.html",children:"BURKOL"})]}),re.jsxs("div",{className:"row wrap",children:[re.jsx("div",{className:"tabs"}),re.jsx("div",{style:{width:12}}),re.jsxs("select",{value:e,onChange:s=>n(s.target.value),children:[re.jsx("option",{value:"tr",children:"Türkçe"}),re.jsx("option",{value:"en",children:"English"})]})]})]})})}function dm(){const{t:n,lang:e,setLang:t}=Xc(),[r,s]=Ie.useState(!1),{notifications:o,showNotification:a,removeNotification:c}=um();Ie.useEffect(()=>{async function m(){try{localStorage.getItem("bk_admin_token")&&(await Ne.me(),s(!0))}catch{localStorage.removeItem("bk_admin_token"),s(!1)}}ai==="admin"&&m()},[]);function h(){s(!0)}function d(){s(!1)}async function p(m){try{await Ne.createQuote(m),a("Teklif başarıyla gönderildi!","success")}catch(I){throw console.error("Quote submission error:",I),I}}return re.jsxs(E.Fragment,{children:[o.map(m=>re.jsx(cm,{message:m.message,type:m.type,onClose:()=>c(m.id)},m.id)),re.jsx(hm,{onLang:t,lang:e,t:n}),ai==="admin"?r?re.jsx(am,{t:n,onLogout:d,showNotification:a}):re.jsx(fm,{onLogin:h,t:n}):re.jsx(nu,{onSubmit:p,showNotification:a,t:n})]})}function fm({onLogin:n,t:e}){const[t,r]=Ie.useState(""),[s,o]=Ie.useState(""),[a,c]=Ie.useState(!0),[h,d]=Ie.useState(""),[p,m]=Ie.useState(!1);async function I(R){if(R.preventDefault(),!t||!s){d("E-posta ve şifre gerekli");return}m(!0),d("");try{const L=await Ne.login(t,s,a);L&&L.token?n():d("Giriş başarısız. Lütfen tekrar deneyin.")}catch(L){console.error(L),d(L.message||"Giriş başarısız. Sunucu hatası.")}finally{m(!1)}}return re.jsx("div",{className:"gate",children:re.jsxs("form",{className:"card",onSubmit:I,style:{maxWidth:400,width:"100%",margin:"0 auto",padding:16,borderRadius:8,boxShadow:"0 4px 8px rgba(0,0,0,0.1)"},children:[re.jsx("h2",{className:"title",style:{marginBottom:16,fontSize:18,textAlign:"center"},children:"Admin Girişi"}),h&&re.jsx("div",{className:"notice",style:{marginBottom:12},children:h}),re.jsxs("div",{className:"field",style:{marginBottom:12},children:[re.jsx("label",{style:{marginBottom:4},children:"E-posta"}),re.jsx("input",{type:"email",name:"email",required:!0,value:t,onChange:R=>r(R.target.value)})]}),re.jsxs("div",{className:"field",style:{marginBottom:16},children:[re.jsx("label",{style:{marginBottom:4},children:"Şifre"}),re.jsx("input",{type:"password",name:"password",required:!0,value:s,onChange:R=>o(R.target.value)})]}),re.jsxs("div",{className:"row",style:{justifyContent:"space-between",alignItems:"center",marginTop:10},children:[re.jsxs("label",{style:{display:"flex",alignItems:"center",gap:"8px",color:"white",fontSize:"14px"},children:[re.jsx("input",{type:"checkbox",checked:a,onChange:R=>c(R.target.checked)}),re.jsx("span",{style:{color:"white"},children:e.remember_me||"Beni hatırla"})]}),re.jsx("button",{type:"submit",className:"btn accent",onMouseOver:R=>R.target.style.backgroundColor="rgba(255,255,255,0.2)",onMouseOut:R=>R.target.style.backgroundColor="",style:{transition:"all 0.2s ease"},children:e.login_btn||"Giriş Yap"})]})]})})}Yc.createRoot(document.getElementById("root")).render(re.jsx(dm,{}));
