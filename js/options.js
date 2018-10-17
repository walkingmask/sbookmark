function update_root_dir() {
    const val = document.getElementById("root-dir").value;
    chrome.storage.sync.set({rootDir: val}, () => {
        let status = document.getElementById("status");
        status.textContent = "Updated.";
        setTimeout(() => {
            status.textContent = "";
        }, 2000);
    });
}

(function() {
    const val = document.getElementById("root-dir").value;
    chrome.storage.sync.get(["rootDir"], (result) => {
        document.getElementById("root-dir").value = result.rootDir;
    });
})();

document.getElementById("update-root-dir").addEventListener("click", update_root_dir);
