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
const Debug = require('debug')
const debug = Debug('zowe-release:decide-if-to-run-build')

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

const sourceDependenciesObject = manifestJsonObject['sourceDependencies']

for (componentGroup in sourceDependenciesObject) { // sourceDependencies is an array
    if (sourceDependenciesObject.hasOwnProperty(componentGroup)) {
        var entries = sourceDependenciesObject[componentGroup].entries
        for (eachEntry in entries) { // entries is an array
            if (entries.hasOwnProperty(eachEntry)) {
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
        }
        if (needBuild) {
            break
        }
    }
}

console.log(`Loop through all projects is done, if we need to run a new build: ${needBuild}`)
core.setOutput('need-to-build', needBuild)

// FIN

function compareTimeToNow(latestCommitDate) {
    var dateTimeCommit = new Date(latestCommitDate)
    var latestCommitInMs = dateTimeCommit.getTime()
    debug(`Latest commit since Epoch: ${latestCommitInMs}`)

    var dateTimeNow = new Date()
    var dateTimeNowInMs = dateTimeNow.getTime()
    debug(`Time now since Epoch: ${dateTimeNowInMs}`)

    var timeDiffInMs = dateTimeNowInMs - latestCommitInMs
    var timeDiffInHr = Math.floor(timeDiffInMs / 1000 / 60 / 60)

    if (timeDiffInHr < timeDiffTriggerMin) {
        console.log(`Latest commit happened less than ${timeDiffTriggerMin}, need to trigger a build.`)
        needBuild = true
    }
}

function getLatestCommitDate(repo, tag) {
    var curlPath = `"${zoweRepoPrefix}/${repo}/${latestCommitGithubAPIPath}${shaParameterGithubAPIPath}${tag}"`
    var curlCommandFull = `curl -s ${curlPath} | ${jqCommand}`
    debug(`Ready to get latest commit date curl command: ${curlCommandFull}`)
    var latestCommitDateTimeInISO8601 = utils.sh(curlCommandFull)
    debug(`DateTime returned is ${latestCommitDateTimeInISO8601}`)
    return latestCommitDateTimeInISO8601
}








