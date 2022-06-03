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
const { utils } = require('zowe-common')
const fs = require('fs')

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