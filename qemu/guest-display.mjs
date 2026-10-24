// Browser-only bridge: share the actual firmware page's rendered timer value.
// No guest flash changes and no independent countdown in the dashboard.
export const displayBridge = `<script>
(()=>{
 if(window.parent===window)return;
 const el=document.getElementById('countdown');if(!el)return;
 const parentOrigin=new URL(document.referrer||location.href).origin;
 const publish=()=>parent.postMessage({type:'arena-firmware-display',text:el.textContent.trim()},parentOrigin);
 new MutationObserver(publish).observe(el,{childList:true,subtree:true,characterData:true});
 publish();
})();
</script>`;

export function adaptGuestHtml(html) {
 return html.replaceAll('ws://${window.location.hostname}:81/','ws://${window.location.host}/ws')
   .replace(/<\/body>/i,displayBridge+'</body>');
}
