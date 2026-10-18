const dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('live-vote-board',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('settings');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
export async function getStored(key){const db=await dbPromise;return new Promise((resolve,reject)=>{const t=db.transaction('settings'),r=t.objectStore('settings').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function setStored(key,value){const db=await dbPromise;return new Promise((resolve,reject)=>{const t=db.transaction('settings','readwrite');t.objectStore('settings').put(value,key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}
export async function removeStored(key){const db=await dbPromise;return new Promise((resolve,reject)=>{const t=db.transaction('settings','readwrite');t.objectStore('settings').delete(key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
export async function compressImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('請上傳 JPG、PNG 或 WebP 圖片（不接受 SVG 或 GIF）。');
  if(file.size>12*1024*1024)throw new Error('原始圖片最多 12 MB，請先縮小後再上傳。');
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width*bitmap.height>40000000)throw new Error('圖片像素過大，請先縮小至 4,000 萬像素以內。');
    let edge=1600,quality=.87,blob;
    const canvas=document.createElement('canvas');
    for(let i=0;i<8;i++){
      const ratio=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
      if(blob&&blob.size<=150*1024)break;
      quality-=.07;edge*=.84;
    }
    if(!blob||blob.size>150*1024)throw new Error('圖片無法壓縮至 150 KB，請換用較小的圖片。');
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  }finally{bitmap.close();}
}
