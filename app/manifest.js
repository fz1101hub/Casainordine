export default function manifest(){
  return {
    name:'Casa in Ordine',short_name:'Casa in Ordine',description:'Bollette, scadenze e gestione domestica',
    start_url:'/',display:'standalone',background_color:'#f6f9f6',theme_color:'#155f53',lang:'it',
    icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},
           {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]
  };
}
