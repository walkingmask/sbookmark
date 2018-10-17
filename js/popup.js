window.addEventListener('click',function(e){
  if(e.target.href!==undefined && e.target.href.length > 0){
    chrome.tabs.create({url:e.target.href})
  }
});
