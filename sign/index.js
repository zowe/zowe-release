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
const actionsGithub = require('@actions/github')
const { utils } = require('zowe-common')
const fs = require('fs')
const Debug = require('debug')
const debug = Debug('zowe-release:sign')
const context = actionsGithub.context

// Defaults
const projectRootPath = process.env.GITHUB_WORKSPACE

// // Gets inputs
// var promoteJsonFileNameFull = core.getInput('promote-json-file-name-full')
// var releaseVersion = core.getInput('release-version')

// //mandatory check
// utils.mandatoryInputCheck(promoteJsonFileNameFull, 'promote-json-file-name-full')
// utils.mandatoryInputCheck(releaseVersion, 'release-version')

// init
var zoweReleaseJsonFile = process.env.ZOWE_RELEASE_JSON_PATTERN
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
        "target"  : ".release/",
        "flat"    : "true"
    })
}

// write downloadSpecJson into a file
var releaseArtifactsDownloadSpecFileFull = projectRootPath + '/release-artifacts-download-spec.json'
fs.writeFileSync(releaseArtifactsDownloadSpecFileFull, JSON.stringify(downloadSpecJson, null, 2))
core.setOutput('RELEASE_ARTIFACTS_DOWNLOAD_SPEC_FILE', releaseArtifactsDownloadSpecFileFull)