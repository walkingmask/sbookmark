const nullNode = {
	id: null,
	title: null,
	children: null,
};

function getBookmarkSubTree(id) {
	return new Promise(resolve => {
		if (id == null) {
			resolve(nullNode);
		}
		else {
			chrome.bookmarks.getSubTree(""+id, (nodes) => {
				resolve(nodes[0]);
			});
		}
	});
}

function getSpecificTitleNode(nodes, title) {
	return new Promise(resolve => {
		if (nodes && title) {
			for (let i = 0; i < nodes.length; i++) {
				if (nodes[i].title === title) {
					resolve(nodes[i]);
					return;
				}
			}
		}
		resolve(nullNode);
	});
}

function getCandidateNodes(nodes, base) {
	return new Promise(resolve => {
		const length = base.length;
		let candidateNodes = [];
		for (let i = 0; i < nodes.length; i++) {
			if (base == nodes[i].title.slice(0, length))
				candidateNodes.push(nodes[i]);
			if (candidateNodes.length > 15)
				break;
		}
		resolve(candidateNodes);
	});
}

class State {
	constructor(root) {
		this.root = root;
		this.path = "";
		this.dirs = [];
		this.base = "";
		this.depth = 0;
		this.nodes = [];
		this.currentNode;
		// In constructor, async/await can't be used
		getBookmarkSubTree(root).then(node =>{
			this.currentNode = node;
		});
	}

	update(_path) {
		return new Promise(async resolve => {
			// Remove it if the first character is '/'
			this.path = (_path[0] === "/")? _path.slice(1) : _path;

			const _parsed = _path.split("/");
			const _dirs = _parsed.slice(0, -1);
			const _base = _parsed.slice(-1)[0];
			const _depth = _dirs.length;

			// Check whether dirs has changed
			let _diffDirsIndex = 0;
			for (; _diffDirsIndex < _depth; _diffDirsIndex++) {
				if (_dirs[_diffDirsIndex] !== this.dirs[_diffDirsIndex]) break;
			}

			// Check if the depth has changed
			const _diffDepthIndex = (_depth < this.depth)? _depth : this.depth;

			// Detect change
			const _updated = (_diffDirsIndex !== _depth) || (_diffDepthIndex !== this.depth);
			const _diffStart = Math.min(_diffDirsIndex, _diffDepthIndex);

			// There is a change
			if (_updated) {
				// Update currentNode
				if (_diffStart === 0)
					this.currentNode = await getBookmarkSubTree(this.root);
				else
					this.currentNode = await getBookmarkSubTree(this.nodes[_diffStart-1]);

				// Update path and node
				for (let i = _diffStart; i < _depth; i++) {
					const _node = await getSpecificTitleNode(this.currentNode.children, _dirs[i]);
					this.dirs[i] = _dirs[i];
					this.nodes[i] = _node.id;
					this.currentNode = _node;
				}
			}

			// Align depth
			this.depth = _depth;
			this.dirs = this.dirs.slice(0, _depth);
			this.nodes = this.nodes.slice(0, _depth);

			// Update base
			this.base = _base;

			resolve();
		});
	}

	represent() {
		return new Promise(resolve => {
			if (! this.currentNode.children)
				resolve(-1);  // Wrong Bookmark Path
			else if (this.depth === 0 && this.base === "")
				resolve(1);   // No Input
			else if (this.depth === 0 && this.base !== "")
				resolve(2);   // /B abc
			else if (this.depth   > 0 && this.base === "")
				resolve(3);   // /B abc/def/
			else if (this.depth   > 0 && this.base !== "")
				resolve(4);	  // /B abc/def/gh
		});
	}
}

// var state = new State(0);
var state;
// Load root bookmark directory setting
chrome.storage.sync.get(["rootDir"], (result) => {
	let root = 0;
    if (result.rootDir) {
    	let parsedRootDir = result.rootDir.split("/");
    	if (parsedRootDir[0] === "") parsedRootDir = parsedRootDir.slice(1);

    	getBookmarkSubTree(root).then(async (node) =>{
	    	for (let i = 0; i < parsedRootDir.length; i++) {
	    		node = await getSpecificTitleNode(node.children, parsedRootDir[i]);
	    		root = (node.id)? node.id : root;
	    	}
	    	state = new State(root);
    	});
    }
    else
	    state = new State(root);
});

function initDefaultSuggestion () {
	let description = "At first, you can choose ";
	for (let i = 0; i < state.currentNode.children.length; i++) {
		description += "'" + state.currentNode.children[i].title + "', ";
	}
	chrome.omnibox.setDefaultSuggestion({
  		description: description
    });
}

function noDefaultSuggestion() {
  	chrome.omnibox.setDefaultSuggestion({
    	description: "No Bookmarks Found"
  	});
}

function updateDefaultSuggestion(plain, match) {
	let description = "";
	if (plain)
		description += plain;
	if (match)
		description += "<match>"+match+"</match>";

  	chrome.omnibox.setDefaultSuggestion({
    	description: description
  	});
}

function makeSuggestions(candidateNodes, dirsText) {
	return new Promise(resolve => {
		let suggestions = [];
		for (let i = 0; i < candidateNodes.length; i++) {
			const node = candidateNodes[i];
			if (node.url) {
				suggestions.push({
					content: node.url,
					description: node.title
				});
			}
			else {
				suggestions.push({
					content: dirsText+node.title,
					description: dirsText+node.title,
				});
			}
		}
		if (suggestions.length === 0) {
			suggestions.push({
				content: "No Bookmarks Found",
				description: "No Bookmarks Found"
			});
		}
		resolve(suggestions);
	});
}

function navigate(url) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.update(tabs[0].id, {url: url});
  });
}

// chrome.omnibox.onInputStarted.addListener(omniboxInputStartedHandler);
chrome.omnibox.onInputChanged.addListener(omniboxInputChangedHandler);
chrome.omnibox.onInputEntered.addListener(omniboxInputEnteredHandler);
// chrome.omnibox.onInputCancelled.addListener(omniboxInputCancelledHandler);

// function omniboxInputStartedHandler () {}

async function omniboxInputChangedHandler (text, suggest) {
	await state.update(text);
	const represent = await state.represent();
	let candidateNodes;
	let plain;

	switch (represent) {
		case 1:  // No Input
		case 2:  // /B abc
			initDefaultSuggestion();
			candidateNodes = await getCandidateNodes(state.currentNode.children, state.base);
			suggestions = await makeSuggestions(candidateNodes, "");
			suggest(suggestions);
			break;
		case 3:  // /B abc/de/
		case 4:  // /B abc/de/fg
			plain = state.dirs.join("/") + "/";
			updateDefaultSuggestion(plain, state.base);
			candidateNodes = await getCandidateNodes(state.currentNode.children, state.base);
			suggestions = await makeSuggestions(candidateNodes, state.dirs.join("/")+"/");
			suggest(suggestions);
			break;
		default:  // No Bookmarks Found
			noDefaultSuggestion();
			break;
	}
}

async function omniboxInputEnteredHandler (text, disposition) {
	// Entered URL
	if (text.slice(0, 4) === "http")
		navigate(text);
	// Entered Bookmarklet
	// else if (text.slice(0, 10) === "javascript") {
	// 	chrome.tabs.executeScript(null, {code: code});
	// }
	// Entered Bookmark Directory
	else {
		const base = text.split("/").slice(-1)[0];
		const children = state.currentNode.children;
		const node = await getSpecificTitleNode(children, base);
		if (node.id) {
			navigate("chrome://bookmarks/?id="+node.id);
		}
	}
}

// function omniboxInputCancelledHandler () {}
