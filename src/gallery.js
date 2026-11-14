import './gallery.css';

export function bindProjectGallery({ onOpen } = {}) {
  const dialog=document.getElementById('project-gallery');
  for(const button of document.querySelectorAll('[data-open-gallery]')){
    button.addEventListener('click',()=>{
      if(dialog.open)return;
      onOpen?.();
      dialog.showModal();
      dialog.scrollTop=0;
    });
  }
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
  });
  return {get open(){return dialog.open;}};
}
