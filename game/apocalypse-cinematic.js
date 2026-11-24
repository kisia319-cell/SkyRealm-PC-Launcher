/* Apocalypse opening cinematic: procedural WebGL scene and synthesized sound. */
(() => {
'use strict';
if(window.ApocalypseCinematic)return;
const TOTAL=36.1,BLACK_IN=16,BLACK_HOLD=17.5,ZOMBIES_AT=21.1,DESCENT_AT=31.1;
let running=false,raf=0,audio=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const mat=()=>new Float32Array(16);
function mul(a,b){const o=mat();for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function tr(x,y,z){const m=mat();m[0]=m[5]=m[10]=m[15]=1;m[12]=x;m[13]=y;m[14]=z;return m;}
function sc(x,y,z){const m=mat();m[0]=x;m[5]=y;m[10]=z;m[15]=1;return m;}
function rz(a){const m=mat(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[1]=s;m[4]=-s;m[5]=c;m[10]=m[15]=1;return m;}
function rx(a){const m=mat(),c=Math.cos(a),s=Math.sin(a);m[0]=1;m[5]=c;m[6]=s;m[9]=-s;m[10]=m[15]=1;return m;}
function ry(a){const m=mat(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[5]=1;m[8]=s;m[10]=m[15]=1;return m;}
function perspective(f,a,n,fz){const q=1/Math.tan(f/2),nf=1/(n-fz),m=mat();m[0]=q/a;m[5]=q;m[10]=(fz+n)*nf;m[11]=-1;m[14]=2*fz*n*nf;return m;}
function look(eye,center,up){let zx=eye[0]-center[0],zy=eye[1]-center[1],zz=eye[2]-center[2],l=Math.hypot(zx,zy,zz)||1;zx/=l;zy/=l;zz/=l;let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;l=Math.hypot(xx,xy,xz)||1;xx/=l;xy/=l;xz/=l;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx,m=mat();m[0]=xx;m[1]=yx;m[2]=zx;m[4]=xy;m[5]=yy;m[6]=zy;m[8]=xz;m[9]=yz;m[10]=zz;m[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);m[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);m[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);m[15]=1;return m;}
function mesh(gl,kind){
let p=[],n=[];
if(kind==='cube'){
const faces=[[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1]]],[[1,0,0],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,-1,1],[1,1,-1],[1,1,1]]],[[-1,0,0],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,-1,-1],[-1,1,1],[-1,1,-1]]],[[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,1],[1,1,-1],[-1,1,-1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,-1],[1,-1,1],[-1,-1,1]]]];
for(const [normal,verts] of faces)for(const v of verts){p.push(...v);n.push(...normal);}
}else if(kind==='sphere'){
const lat=10,lon=14;for(let y=0;y<lat;y++){const a=y*Math.PI/lat,b=(y+1)*Math.PI/lat;for(let x=0;x<lon;x++){const u=x*2*Math.PI/lon,v=(x+1)*2*Math.PI/lon,q=[[Math.sin(a)*Math.cos(u),Math.cos(a),Math.sin(a)*Math.sin(u)],[Math.sin(b)*Math.cos(u),Math.cos(b),Math.sin(b)*Math.sin(u)],[Math.sin(b)*Math.cos(v),Math.cos(b),Math.sin(b)*Math.sin(v)],[Math.sin(a)*Math.cos(u),Math.cos(a),Math.sin(a)*Math.sin(u)],[Math.sin(b)*Math.cos(v),Math.cos(b),Math.sin(b)*Math.sin(v)],[Math.sin(a)*Math.cos(v),Math.cos(a),Math.sin(a)*Math.sin(v)]];for(const z of q){p.push(...z);n.push(...z);}}}
}else{
for(let i=0;i<16;i++){const a=i*2*Math.PI/16,b=(i+1)*2*Math.PI/16,q=[[Math.cos(a),-1,Math.sin(a)],[Math.cos(b),-1,Math.sin(b)],[0,1,0],[Math.cos(a),-1,Math.sin(a)],[0,1,0],[Math.cos(b),-1,Math.sin(b)]];for(const z of q){p.push(...z);const l=Math.hypot(z[0],z[2])||1;n.push(z[0]/l,.25,z[2]/l);}}
}
const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(p),gl.STATIC_DRAW);
const nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(n),gl.STATIC_DRAW);
return{pb,nb,count:p.length/3};
}
function init(canvas){
const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'})||canvas.getContext('experimental-webgl');if(!gl)return null;
const vs='attribute vec3 aPosition;attribute vec3 aNormal;uniform mat4 uMVP;uniform mat4 uModel;varying vec3 vNormal;varying vec3 vWorld;void main(){vec4 w=uModel*vec4(aPosition,1.0);vWorld=w.xyz;vNormal=mat3(uModel)*aNormal;gl_Position=uMVP*vec4(aPosition,1.0);}';
const fs='precision mediump float;uniform vec3 uColor;uniform float uGlow;uniform vec3 uLight;varying vec3 vNormal;varying vec3 vWorld;void main(){vec3 N=normalize(vNormal);float d=max(dot(N,normalize(uLight-vWorld)),0.0);float shade=.30+d*.78;gl_FragColor=vec4(uColor*shade+uColor*uGlow,1.0);}';
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pr));gl.useProgram(pr);
const l={p:gl.getAttribLocation(pr,'aPosition'),n:gl.getAttribLocation(pr,'aNormal'),mvp:gl.getUniformLocation(pr,'uMVP'),model:gl.getUniformLocation(pr,'uModel'),color:gl.getUniformLocation(pr,'uColor'),glow:gl.getUniformLocation(pr,'uGlow'),light:gl.getUniformLocation(pr,'uLight')};
return{gl,l,meshes:{cube:mesh(gl,'cube'),sphere:mesh(gl,'sphere'),cone:mesh(gl,'cone')}};
}
function makeAudio(){
try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;const ctx=new AC(),master=ctx.createGain();master.gain.value=.38;master.connect(ctx.destination);
const osc=(f,type,gain)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=f;g.gain.value=gain;o.connect(g);g.connect(master);o.start();return{o,g};};
function noise(d,v,hz){const len=Math.floor(ctx.sampleRate*d),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/len,.65);const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=buf;f.type='lowpass';f.frequency.value=hz;g.gain.value=v;src.connect(f);f.connect(g);g.connect(master);src.start();}
function tone(f,d,v,type='sine'){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(25,f*.48),ctx.currentTime+d);g.gain.setValueAtTime(v,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+d);o.connect(g);g.connect(master);o.start();o.stop(ctx.currentTime+d+.02);}
const rotor=osc(34,'sawtooth',.03),wind=osc(72,'sine',.014);
return{ctx,master,rotor,wind,noise,tone,close(){try{master.gain.setTargetAtTime(0,ctx.currentTime,.12);setTimeout(()=>ctx.close(),400);}catch(_){}}};
}catch(_){return null;}
}
function play(done){
if(running)return;if(window.Apocalypse3DConsent&&!window.Apocalypse3DConsent.enabled()){if(done)done();return;}running=true;
const root=document.createElement('div');root.id='apocalypse-opening-cinematic';root.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#020307;overflow:hidden;pointer-events:auto;font-family:Segoe UI,Arial,sans-serif';
const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';

const black=document.createElement('div');black.style.cssText='position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .08s linear';
const scan=document.createElement('div');scan.style.cssText='position:absolute;inset:0;opacity:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.035) 4px),radial-gradient(ellipse at center,transparent 38%,rgba(0,0,0,.75) 100%)';
root.append(canvas,scan,black);document.body.appendChild(root);
let renderer;try{renderer=init(canvas);}catch(_){renderer=null;}
if(!renderer){root.remove();running=false;if(done)done();return;}
const {gl,l,meshes}=renderer;audio=makeAudio();const fired={impact:false,static:false,growl:false,growl2:false,growl3:false,base:false,tunnel:false};
const buildings=[[-10,4,-7,3,9],[-6,5,-9,3,12],[-2,3,-8,2.5,7],[3,4,-9,3,10],[8,5,-7,3,13],[12,3,-8,2.4,8],[-13,3,-2,2.8,7],[13,4,-1,3,10],[-9,5,5,3,12],[9,5,5,3,12]];
const cam={view:mat(),proj:mat()};
function draw(mesh,x,y,z,sx,sy,sz,color,glow=0,rot=0,tilt=0){
const model=mul(mul(tr(x,y,z),mul(ry(rot),mul(rz(tilt),rx(0)))),sc(sx,sy,sz)),mvp=mul(cam.proj,mul(cam.view,model));
gl.uniformMatrix4fv(l.model,false,model);gl.uniformMatrix4fv(l.mvp,false,mvp);gl.uniform3fv(l.color,color);gl.uniform1f(l.glow,glow);gl.uniform3f(l.light,-5,12,8);
gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);gl.vertexAttribPointer(l.p,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(l.p);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.nb);gl.vertexAttribPointer(l.n,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(l.n);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
}
function person(x,y,z,t,mutant=false){
const bob=Math.sin(t*4+x)*.06,k=mutant?1.35:1,skin=mutant?[.25,.31,.24]:[.34,.38,.29],cloth=mutant?[.16,.12,.12]:[.22,.19,.17];
draw(meshes.sphere,x,y+.9*k+bob,z,.38*k,.56*k,.27*k,cloth);draw(meshes.sphere,x,y+1.55*k+bob,z,.28*k,.3*k,.25*k,skin);
draw(meshes.sphere,x-.105*k,y+1.59*k+bob,z+.22*k,.045,.04,.035,[.9,.07,.045],1.3);draw(meshes.sphere,x+.105*k,y+1.59*k+bob,z+.22*k,.045,.04,.035,[.9,.07,.045],1.3);
draw(meshes.sphere,x-.19*k,y+.38*k,z,.13*k,.42*k,.14*k,skin,0,0,Math.sin(t*3+x)*.16);draw(meshes.sphere,x+.19*k,y+.38*k,z,.13*k,.42*k,.14*k,skin,0,0,-Math.sin(t*3+x)*.16);
draw(meshes.sphere,x-.46*k,y+1*k,z,.12*k,.4*k,.13*k,skin,0,0,Math.sin(t*4+x)*.35);draw(meshes.sphere,x+.46*k,y+1*k,z,.12*k,.4*k,.13*k,skin,0,0,-Math.sin(t*4+x)*.35);
if(mutant){draw(meshes.cone,x-.2,y+1.95*k,z,.16,.36,.16,[.32,.34,.28]);draw(meshes.cone,x+.2,y+1.95*k,z,.16,.36,.16,[.32,.34,.28]);draw(meshes.sphere,x,y+.85*k,z-.2,.5,.62,.36,[.18,.23,.19]);}
}
function heli(t){
const fall=ease((t-3)/9),x=-2+fall*3,y=12-fall*9.8,z=1;
draw(meshes.cube,x,y,z,1.9,.55,.75,[.17,.22,.25],0,fall*.85,fall*.8);draw(meshes.sphere,x+.9,y+.05,z+.12,.68,.42,.62,[.22,.31,.35],.08,fall*.8);
draw(meshes.cube,x-2.25,y+.1,z,.95,.13,.15,[.19,.24,.26],0,0,fall*.5);draw(meshes.cube,x-3.1,y+.32,z,.14,.45,.12,[.2,.25,.27],0,0,fall*.5);
draw(meshes.cube,x,y+.64,z,2.7,.045,.08,[.08,.09,.1],.08,Math.sin(t*28)*.08);draw(meshes.cube,x,y+.64,z,.09,.045,2.5,[.08,.09,.1],.08,Math.sin(t*28));
draw(meshes.cube,x-.75,y-.58,z-.38,.08,.8,.08,[.16,.18,.2],0,0,fall*.5);draw(meshes.cube,x+.75,y-.58,z-.38,.08,.8,.08,[.16,.18,.2],0,0,fall*.5);
}
function render(t){
const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(1.6,window.devicePixelRatio||1);if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);gl.viewport(0,0,canvas.width,canvas.height);}
gl.enable(gl.DEPTH_TEST);gl.clearColor(.025,.035,.05,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);cam.proj=perspective(Math.PI/3,canvas.width/Math.max(1,canvas.height),.1,160);
if(t<16){
const shake=t>11?Math.sin(t*39)*.22*ease((t-11)/5):0;
const shots=[
{a:0,b:1.5,e:[-18,13,26],c:[0,6,0],roll:0},
{a:1.5,b:3.0,e:[-11,5,17],c:[-1,7,0],roll:-.025},
{a:3.0,b:4.6,e:[-3,11,13],c:[-2,8,1],roll:.035},
{a:4.6,b:6.1,e:[8,12,15],c:[1,7,0],roll:.02},
{a:6.1,b:7.6,e:[15,5,9],c:[2,5,0],roll:-.035},
{a:7.6,b:9.0,e:[4,2,8],c:[1,4,0],roll:.025},
{a:9.0,b:10.3,e:[-7,3,7],c:[1,3,0],roll:-.02},
{a:10.3,b:11.6,e:[-2,8,16],c:[1,1,0],roll:.04},
{a:11.6,b:12.8,e:[5,2,6],c:[1,1,0],roll:.08},
{a:12.8,b:14.1,e:[-5,12,19],c:[1,0,0],roll:.015},
{a:14.1,b:16,e:[0,5,28],c:[0,1,0],roll:0}
];
const shot=shots.find(s=>t>=s.a&&t<s.b)||shots[shots.length-1],p=ease((t-shot.a)/(shot.b-shot.a));
const prev=shots[Math.max(0,shots.indexOf(shot)-1)];
const eye=shot.e.map((v,i)=>mix(prev.e[i],v,p)),target=shot.c.map((v,i)=>mix(prev.c[i],v,p));
eye[1]+=shake;
const roll=mix(prev.roll,shot.roll,p),up=[Math.sin(roll),Math.cos(roll),0];
cam.view=look(eye,target,up);draw(meshes.cube,0,-.35,0,45,.35,34,[.09,.1,.11]);
for(const b of buildings){draw(meshes.cube,b[0],b[1]/2,b[2],b[3],b[1]/2,b[4],[.13,.15,.17]);for(let j=0;j<8;j++)draw(meshes.cube,b[0]+((j%3)-1)*.65,b[1]*.45,b[2]+b[4]*.52+.02,.12,.18,.03,[.45,.28,.12],.12);}
if(t<13.5)heli(t);if(t>12.1){const k=ease((t-12.1)/1.2);for(let j=0;j<22;j++){const a=j*2.399;draw(meshes.sphere,1+Math.cos(a)*k*4,1+Math.sin(a*1.7)*k*2,Math.sin(a)*k*3,.18+k*.15,.18+k*.15,.18+k*.15,[.85,.28,.07],.25);}}
}else if(t>=ZOMBIES_AT&&t<DESCENT_AT){
const q=t-ZOMBIES_AT;
const zshots=[
{a:0,b:1.8,e:[-15,13,22],c:[0,1,0],r:0},
{a:1.8,b:3.7,e:[-9,5,14],c:[-2,1,0],r:-.025},
{a:3.7,b:5.5,e:[-1,2,7],c:[0,1,0],r:.018},
{a:5.5,b:7.2,e:[9,4,11],c:[2,1,-2],r:.04},
{a:7.2,b:8.8,e:[4,10,17],c:[0,0,0],r:-.02},
{a:8.8,b:10,e:[-4,3,8],c:[-1,1,0],r:.025}
];
const zs=zshots.find(v=>q>=v.a&&q<v.b)||zshots[zshots.length-1],zi=zshots.indexOf(zs),zp=ease((q-zs.a)/(zs.b-zs.a)),zprev=zshots[Math.max(0,zi-1)];
const ze=zs.e.map((v,i)=>mix(zprev.e[i],v,zp)),zc=zs.c.map((v,i)=>mix(zprev.c[i],v,zp)),zr=mix(zprev.r,zs.r,zp);
ze[0]+=Math.sin(q*1.25)*.35;ze[1]+=Math.sin(q*2.1)*.12;
cam.view=look(ze,zc,[Math.sin(zr),Math.cos(zr),0]);
draw(meshes.cube,0,-.35,0,48,.35,35,[.075,.08,.075]);
for(const b of buildings){draw(meshes.cube,b[0],b[1]/2,b[2],b[3],b[1]/2,b[4],[.11,.12,.12]);if(q>2.5)draw(meshes.cube,b[0],b[1]+.08,b[2],b[3]*.7,.035,b[4]*.7,[.19,.11,.075],.12);}
for(let j=0;j<9;j++){
const spawn=1+j*.78,p=ease((q-spawn)/2.1),x=-10+j*2.5,z=2+(j%3)*-2;
if(p>0){person(x,-1.3+p*1.3,z,q,j===4||j===7);
const burst=clamp((q-spawn)*1.7,0,1);
for(let d=0;d<5;d++){const ang=d*2.4+j;draw(meshes.sphere,x+Math.cos(ang)*(.4+burst*.65),-.1+Math.sin(ang*1.7)*.18,z+Math.sin(ang)*(.4+burst*.65),.12,.08,.12,[.24,.2,.15],.05);}
}}
for(let j=0;j<4;j++)if(q>3+j*.9){const x=-5+j*3,z=-7;person(x,-.02,z,q,j%2===0);if(j===1||j===3){const pulse=.85+Math.sin(q*5+j)*.12;draw(meshes.sphere,x,.35,z,.62*pulse,.9*pulse,.55*pulse,[.2,.23,.18],.08);}}

}else{
const q=clamp((t-DESCENT_AT)/5,0,1),y=mix(4,-10,ease(q));
const orbit=Math.sin(q*Math.PI*1.25)*2.4,forward=13-q*5;
cam.view=look([orbit,y,forward],[0,-10,-1],[Math.sin(q*.35)*.04,1,0]);
draw(meshes.cube,0,.2,0,45,.25,35,[.12,.095,.07]);draw(meshes.cube,0,-11.8,0,28,.3,22,[.07,.075,.08]);
draw(meshes.cube,-9,-6,0,.5,6,15,[.15,.12,.1]);draw(meshes.cube,9,-6,0,.5,6,15,[.15,.12,.1]);draw(meshes.cube,0,-6,-12,9,6,.5,[.16,.12,.1]);draw(meshes.cube,0,-6,12,9,6,.5,[.16,.12,.1]);
for(let j=0;j<10;j++){const x=-7+(j%5)*3.5,z=-7+Math.floor(j/5)*10;draw(meshes.sphere,x,-8.2,z,.22,.22,.22,[.8,.04,.025],1.6);draw(meshes.cube,x,-8.8,z,.08,.8,.08,[.18,.16,.14],.1);}
for(let j=0;j<6;j++)person(-6+j*2.4,-10.9,-3+(j%2)*5,t,j===2||j===5);draw(meshes.cube,0,-10.95,0,6,.12,1,[.19,.08,.07],.35);
}
}
// Storytelling is visual-only: no captions, subtitles, or dialogue.
const started=performance.now();
function frame(now){
if(!running)return;const t=Math.min(TOTAL,(now-started)/1000);
if(audio){audio.rotor.o.frequency.setTargetAtTime(32+Math.sin(t*17)*5,audio.ctx.currentTime,.08);audio.rotor.g.gain.setTargetAtTime(t<15?.03:.0001,audio.ctx.currentTime,.35);audio.wind.o.frequency.setTargetAtTime(68+t*1.8,audio.ctx.currentTime,.12);}
if(t>12.1&&!fired.impact){fired.impact=true;if(audio){audio.noise(2.2,.24,950);audio.tone(72,2.5,.16,'sawtooth');}}
if(t>17.4&&!fired.static){fired.static=true;if(audio)audio.noise(3.8,.09,6500);}
if(t>ZOMBIES_AT+1&&!fired.growl){fired.growl=true;if(audio){audio.tone(48,2.4,.12);audio.noise(1.5,.09,480);}}
if(t>24.5&&!fired.growl2){fired.growl2=true;if(audio){audio.tone(61,2.1,.11,'sawtooth');audio.noise(1.4,.07,720);}}
if(t>28&&!fired.growl3){fired.growl3=true;if(audio){audio.tone(43,2.8,.13);audio.noise(1.8,.08,360);}}
if(t>DESCENT_AT&&!fired.base){fired.base=true;if(audio){audio.tone(38,4.8,.12);audio.noise(3.5,.05,320);}}
if(t>33.2&&!fired.tunnel){fired.tunnel=true;if(audio){audio.noise(2.4,.065,1800);audio.tone(84,2.2,.07);}}
if(t>=BLACK_IN&&t<BLACK_HOLD){black.style.opacity=String(ease((t-BLACK_IN)/1.5));scan.style.opacity='0';}
else if(t>=BLACK_HOLD&&t<ZOMBIES_AT){black.style.opacity='1';scan.style.opacity=t>20.8?'.8':'0';}
else if(t>=ZOMBIES_AT){black.style.opacity=String(1-ease((t-ZOMBIES_AT)/.28));scan.style.opacity='0';}
else{black.style.opacity='0';scan.style.opacity=t>12?String(ease((t-12)/2)*.25):'0';}
render(t);if(t>=TOTAL){finish();return;}raf=requestAnimationFrame(frame);
}
function finish(){running=false;cancelAnimationFrame(raf);if(audio){audio.close();audio=null;}root.style.transition='opacity .45s';root.style.opacity='0';setTimeout(()=>{root.remove();if(typeof done==='function')done();},460);}
raf=requestAnimationFrame(frame);
}
window.ApocalypseCinematic={play};
})();