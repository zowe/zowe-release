/*
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2022
 */

const core = require('@actions/core')
const { github, utils } = require('zowe-common')
const fs = require('fs')
const Debug = require('debug')
const debug = Debug('zowe-release:promote')

// Defaults
const projectRootPath = process.env.GITHUB_WORKSPACE

// Gets inputs
var promoteJsonFileNameFull = core.getInput('promote-json-file-name-full')
var releaseVersion = core.getInput('release-version')

//mandatory check
utils.mandatoryInputCheck(promoteJsonFileNameFull, 'promote-json-file-name-full')
utils.mandatoryInputCheck(releaseVersion, 'release-version')

// init - will automatic decide if picking up v1 or v2 release json file
var zoweReleaseJsonFile = process.env.ZOWE_RELEASE_JSON_PATTERN
if (releaseVersion.startsWith('1')) {
	zoweReleaseJsonFile = zoweReleaseJsonFile.replace(/@/g,'1')
} else if (releaseVersion.startsWith('2')) {
	zoweReleaseJsonFile = zoweReleaseJsonFile.replace(/@/g,'2')
}
var zoweReleaseJsonObject = JSON.parse(fs.readFileSync(projectRootPath + '/' + zoweReleaseJsonFile))

// this is the target Artifactory path will be released to
var targetPath = `${zoweReleaseJsonObject['zowe']['to']}/org/zowe/${releaseVersion}`



// def buildTimestamp = source.containsKey('build.timestamp') ? source['build.timestamp'] : ''
// def buildName      = source.containsKey('build.name') ? source['build.name'] : ''
// def buildNumber    = source.containsKey('build.number') ? source['build.number'] : ''

// def targetFullPath = "${targetPath}/${targetName}"

// // variables prepared, ready to promote
// this.steps.echo "Promoting artifact: ${source['path']}\n" +
//                 "- to              : ${targetFullPath}\n" +
//                 "- build name      : ${buildName}\n" +
//                 "- build number    : ${buildNumber}\n" +
//                 "- build timestamp : ${buildTimestamp}\n"

// // promote (copy) artifact
// def promoteResult = this.steps.sh(
//     script: "jfrog rt copy --flat \"${source.path}\" \"${targetFullPath}\"",
//     returnStdout: true
// ).trim()

// // validate result
// def promoteResultObject = this.steps.readJSON(text: promoteResult)
// this.steps.echo "Artifact promoting result:\n" +
//     "- status  : ${promoteResultObject['status']}\n" +
//     "- success : ${promoteResultObject['totals']['success']}\n" +
//     "- failure : ${promoteResultObject['totals']['failure']}"
// if (promoteResultObject['status'] != 'success' ||
//     promoteResultObject['totals']['success'] != 1 || promoteResultObject['totals']['failure'] != 0) {
//     throw new ArtifactException("Artifact is not promoted successfully.")
// }

// // prepare artifact property
// def props = []
// def currentBuildName = env.JOB_NAME
// props << "build.name=${currentBuildName}"
// props << "build.number=${env.BUILD_NUMBER}"
// if (buildName) {
//     props << "build.parentName=${buildName}"
// }
// if (buildNumber) {
//     props << "build.parentNumber=${buildNumber}"
// }
// if (buildTimestamp) {
//     props << "build.timestamp=${buildTimestamp}"
// }

// // update artifact property
// this.steps.echo "Updating artifact properties:\n${props.join("\n")}"

// def setPropsResult = this.steps.sh(
//     script: "jfrog rt set-props \"${targetFullPath}\" \"" + props.join(';') + "\"",
//     returnStdout: true
// ).trim()
// def setPropsResultObject = this.steps.readJSON(text: setPropsResult)
// this.steps.echo "Artifact promoting result:\n" +
//     "- status  : ${setPropsResultObject['status']}\n" +
//     "- success : ${setPropsResultObject['totals']['success']}\n" +
//     "- failure : ${setPropsResultObject['totals']['failure']}"
// if (setPropsResultObject['status'] != 'success' ||
//     setPropsResultObject['totals']['success'] != 1 || setPropsResultObject['totals']['failure'] != 0) {
//     throw new ArtifactException("Artifact property is not updated successfully.")
// }

// return targetFullPath