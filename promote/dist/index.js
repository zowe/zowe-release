/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 806:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 946:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 412:
/***/ ((module) => {

module.exports = eval("require")("debug");


/***/ }),

/***/ 726:
/***/ ((module) => {

module.exports = eval("require")("zowe-common");


/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = require("fs");;

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
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";/************************************************************************/
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
const actionsGithub = __nccwpck_require__(946)
const { utils } = __nccwpck_require__(726)
const fs = __nccwpck_require__(747)
const Debug = __nccwpck_require__(412)
const debug = Debug('zowe-release:promote')
const context = actionsGithub.context

// Defaults
const projectRootPath = process.env.GITHUB_WORKSPACE

// Gets inputs
var promoteJsonFileNameFull = core.getInput('promote-json-file-name-full')
var releaseVersion = core.getInput('release-version')

//mandatory check
utils.mandatoryInputCheck(promoteJsonFileNameFull, 'promote-json-file-name-full')
utils.mandatoryInputCheck(releaseVersion, 'release-version')

// init
var nightly = false
if (releaseVersion.includes('nightly')) {
    nightly = true
}
var zoweReleaseJsonFile = process.env.ZOWE_RELEASE_JSON
var zoweReleaseJsonObject = JSON.parse(fs.readFileSync(projectRootPath + '/' + zoweReleaseJsonFile))

// this is the target Artifactory path will be released to
var targetPath = `${zoweReleaseJsonObject['zowe']['to']}/org/zowe/${releaseVersion}`

var promoteJsonObject = JSON.parse(fs.readFileSync(promoteJsonFileNameFull))

// make a jfrog download file spec for later steps
var downloadSpecJson = {"files":[]}

for (let [component, properties] of Object.entries(promoteJsonObject)) {
    var buildTimestamp = properties['source']['props']['build.timestamp']
    var buildName = properties['source']['props']['build.name']
    var buildNumber = properties['source']['props']['build.number']
    var sourceFullPath = `${properties['source']['path']}`
    var targetFullPath = `${targetPath}/${properties['target']}`

    //sometimes error occured on CLI nightly pipeline, so a particular night CLI doesn't have nightly build
    // thus we do a pre-check here for CLI
    if (targetFullPath.includes('cli') && nightly) {
        var preCheckOut = utils.sh(`jfrog rt search ${targetFullPath} | jq -r '.[]'`)
        if (preCheckOut != '') {
            // found
            console.warn('Latest CLI artifacts were promoted the night before.')
            downloadSpecJson['files'].push({
                "pattern" : `CLI_WAS_COPIED${properties['target']}`,
                "target"  : '',
                "flat"    : "true"
            })
            continue
        }
    }
    
    console.log(`Promoting artifact ${component}
- from              :  ${sourceFullPath}
- to                :  ${targetFullPath}
- build name        :  ${buildName}
- build number      :  ${buildNumber}
- build timestamp   :  ${buildTimestamp}
`)

    // promote (copy) artifact
    var cmd = `jfrog rt copy --flat "${sourceFullPath}" "${targetFullPath}"`
    debug(cmd)
    var promoteResult = utils.sh(cmd)
    
    // validate result
    var promoteResultObject = JSON.parse(promoteResult)
    console.log(`Artifact promoting result:
- status  : ${promoteResultObject['status']}
- success : ${promoteResultObject['totals']['success']}
- failure : ${promoteResultObject['totals']['failure']}
`)
    if (promoteResultObject['status'] != 'success' ||
        promoteResultObject['totals']['success'] != 1 || promoteResultObject['totals']['failure'] != 0) {
        throw new Error("Artifact is not promoted successfully.")
    }

    // prepare artifact property
    var props = []
    if (buildName) {
        props.push(`build.parentName=${buildName}`)
    }
    if (buildNumber) {
        props.push(`build.parentNumber=${buildNumber}`)
    }
    if (buildTimestamp) {
        props.push(`build.timestamp=${buildTimestamp}`)
    }

    // get current release pipeline run name and number
    props.push(`build.name=${context.repo.repo}/${context.ref.replace('refs/heads/','')}`)
    props.push(`build.number=${context.runNumber}`)
    console.log(`Updating artifact properties:\n${props.join('\n')}`)

    // update artifact property
    var cmd1 = `jfrog rt set-props "${targetFullPath}" "${props.join(';')}"`
    debug(cmd1)
    var setPropsResult = utils.sh(cmd1)

    // validate result
    var setPropsResultObject = JSON.parse(setPropsResult)
    console.log(`Artifact set props result:
- status  : ${setPropsResultObject['status']}
- success : ${setPropsResultObject['totals']['success']}
- failure : ${setPropsResultObject['totals']['failure']}
`)
    if (setPropsResultObject['status'] != 'success' ||
        setPropsResultObject['totals']['success'] != 1 || setPropsResultObject['totals']['failure'] != 0) {
        throw new Error("Artifact property is not updated successfully.")
    }

    // make a jfrog download file spec for later steps
    downloadSpecJson['files'].push({
        "pattern" : targetFullPath,
        "target"  : `${process.env.LOCAL_RELEASE_FOLDER}/`,
        "flat"    : "true"
    })
}

// write downloadSpecJson into a file, this file will be used in download step in workflow
var releaseArtifactsDownloadSpecFileFull = process.env.RUNNER_TEMP + '/release-artifacts-download-spec.json'
fs.writeFileSync(releaseArtifactsDownloadSpecFileFull, JSON.stringify(downloadSpecJson, null, 2))
core.setOutput('RELEASE_ARTIFACTS_DOWNLOAD_SPEC_FILE', releaseArtifactsDownloadSpecFileFull)
})();

module.exports = __webpack_exports__;
/******/ })()
;