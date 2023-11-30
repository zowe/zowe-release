/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 806:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 726:
/***/ ((module) => {

module.exports = eval("require")("zowe-common");


/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2022
 */

const core = __nccwpck_require__(806)
const { utils } = __nccwpck_require__(726)
const fs = __nccwpck_require__(747)

// Defaults
const zoweRepoPrefix = 'https://api.github.com/repos/zowe'
const latestCommitGithubAPIPath = 'commits?page=1&per_page=1'
const shaParameterGithubAPIPath = '&sha='
const jqCommand = `jq -r ".[0].commit.committer.date"`
const projectRootPath = process.env.GITHUB_WORKSPACE
const manifestFilePath = projectRootPath + "/manifest.json"
const manifestJsonObject = JSON.parse(fs.readFileSync(manifestFilePath))

// Gets inputs
const timeDiffTriggerMinString = core.getInput('time-difference-threshold-min')

// Mandatory check
utils.mandatoryInputCheck(timeDiffTriggerMinString, 'time-difference-threshold-min')

// Main
const timeDiffTriggerMin = parseInt(timeDiffTriggerMinString)
var needBuild = false
const sourceDependenciesObject = manifestJsonObject['sourceDependencies'];
for (let i=0; i<sourceDependenciesObject.length; i++) {
    var entries = sourceDependenciesObject[i].entries
    for (let j=0; j<entries.length; j++) {
        var eachEntry = entries[j]
        console.log(`===== Examining ${eachEntry.repository}, branch is ${eachEntry.tag}`)
        // date and time returned is UTC time
        var latestCommitDate = getLatestCommitDate(eachEntry.repository, eachEntry.tag)                
        if (latestCommitDate && !latestCommitDate.includes('error')) { // everything looks good
            compareTimeToNow(latestCommitDate)
            if (needBuild) {
                break
            }
        }
        console.log('')
    }
    if (needBuild) {
        break
    }
}

console.log(`Loop through all projects is done, if we need to run a new build: ${needBuild}`)
if (needBuild) {
    needBuildOutput = 'YES'
}
else {
    needBuildOutput = 'NO'
}
core.exportVariable('RUN_BUILD', needBuildOutput)

// FIN


function getLatestCommitDate(repo, tag) {
    var curlPath = `"${zoweRepoPrefix}/${repo}/${latestCommitGithubAPIPath}${shaParameterGithubAPIPath}${tag}"`
    var curlCommandFull = `curl -s ${curlPath} | ${jqCommand}`
    console.log(`Ready to get latest commit date curl command: ${curlCommandFull}`)
    var latestCommitDateTimeInISO8601 = utils.sh(curlCommandFull)
    console.log(`DateTime returned is ${latestCommitDateTimeInISO8601}`)
    return latestCommitDateTimeInISO8601
}

function compareTimeToNow(latestCommitDate) {
    var dateTimeCommit = new Date(latestCommitDate)
    var latestCommitInMs = dateTimeCommit.getTime()
    console.log(`Latest commit since Epoch: ${latestCommitInMs}`)

    var dateTimeNow = new Date()
    var dateTimeNowInMs = dateTimeNow.getTime()
    console.log(`Time now since Epoch: ${dateTimeNowInMs}`)

    var timeDiffInMs = dateTimeNowInMs - latestCommitInMs
    var timeDiffInHr = Math.floor(timeDiffInMs / 1000 / 60 / 60)

    console.log(`Latest commit occured ${timeDiffInHr} hours ago`)
    if (timeDiffInHr < timeDiffTriggerMin) {
        console.log(`   less than ${timeDiffTriggerMin} hours, trigger a new build: YES`)
        needBuild = true
    }
    else {
        console.log(`   greater than ${timeDiffTriggerMin} hours, trigger a new build: NOPE`)
    }
}
})();

module.exports = __webpack_exports__;
/******/ })()
;