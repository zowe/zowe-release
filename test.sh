zowe_release_version=1.99.0

if [[ "$zowe_release_version" =~ ^([0-9]*)\.([0-9]*)\.([0-9]*)$ ]]; then
    echo ">>>> Version $zowe_release_version is considered as a FORMAL RELEASE."
else
    echo ">>>> Version $zowe_release_version is NOT considered as a FORMAL RELEASE."
fi