# Upgrade Guidelines

These guidelines are useful in order to remember what to do when someone wants to upgrade the version of the app

## 0. JSON Versions

There are some versions in the app json files:

* `default_settings.json` (App Source folder) and `custom_settings.json` (`AppData` folder)

    * `"json_version"`: if they have different versions, the version must be updated in `custom_settings.json` file.

        TODO: I think all the new calculated parameters created by the user should be kept. Just new calculated parameters should be added to the `custom_settings.json` file. The rest of attributes must be added as well if there is any new one, but if they already exist the value must be kept.

* `shared_data.json` (`Source` and `AppData` folder)

    * `"json_version"`: If they have different versions, the version must be updated

    * `"retrocompatible_version"`: This version must be updated if there are breaking changes in the `default_settings.json` file or in the way the data files are opened or saved.

## 1. Create Git Commit to upgrade the version and add a Tag

Create a commit as usual just changing the versions in the files:

    setup.py
    package.json

Create the tag in that commit

    git tag v1.3.0           # -s parameter if we want to sign it with gpg
    git push origin v1.3.0

## 2. Create a fresh Conda Environment

To create an environment from scratch and install the `atlantos-qc` package

* Windows x64 + Conda

    conda create --prefix env python=3.7.3     # same level as atlantos_qc and atlantos_qc_js folders
    activate .\env
    python -m pip install --upgrade pip
    pip install --upgrade setuptools

* Linux + Virtualenv

    virtualenv --python=/usr/bin/python3 env
    source env/bin/activate

## 3. Install Packages

    cd atlantos_qc_js
    yarn install                               # create a fresh yarn install

    cd atlantos_qc
    python setup.py install                    # run this in the atlantos-qc folder where setup.py is stored

## 4. Create the executable and upload it to GutHub

Create the installable in the current Operating System. Use yarn

    yarn dist_win

Rename the executable file. The appropriate name should be inside the `latest.yml` file

    atlantos-qc-setup-1.3.0.exe

Create a new Release in GitHub using the tag you have created and upload the following files

    atlantos-qc-setup-1.3.0.exe
    lates.yml

I think the blockmap file is not needed to make it work.

Update the installers in the `README.md`

## 5. Tests

Before uploading to GitHub you may want to install in your computer just to be sure that everything works well.