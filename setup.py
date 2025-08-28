import os
from os.path import dirname, exists, join, realpath, relpath
from setuptools import setup
import sys
import shutil

#  TODO: update to the new way to build the setup with pyproject.toml
#        https://setuptools.pypa.io/en/latest/userguide/pyproject_config.html

#  NOTE: Shebangs:
#      * https://docs.python.org/3/using/windows.html#shebang-lines
#      * https://github.com/pypa/pip/issues/4616

if sys.platform == 'win32':
    sys.executable='python.exe'

ROOT = dirname(realpath(__file__))

def get_package_data():
    print('-- GET PACKAGE DATA')

    def get_file_paths(main_path=None, filters=()):
        ''' @filters = ('.html')
        '''
        main_path = join(ROOT, main_path)
        print('>> AtlantosQC JS PATH: {}'.format(main_path))
        if not exists(main_path) or main_path is None:
            raise RuntimeError("packaging non-existent path: %s" % main_path)

        file_paths = []
        for path, dirs, files in os.walk(main_path):
            path = relpath(path, main_path)
            print('>> AtlantosQC JS rel PATH: {}'.format(path))
            for f in files:
                if not filters or f.endswith(filters):
                    file_paths.append(join(path, f))
        print('>> PACKAGE DATA: {}'.format(file_paths))
        return file_paths

    return {
        'atlantos_qc': [
            'templates/*.*',
            'files/*.json',
        ] + ['static/' + x for x in get_file_paths('atlantos_qc/static')]
          + ['data_models/extra/' + x for x in get_file_paths('atlantos_qc/data_models/extra')]
        # 'atlantos_qc_js': get_file_paths('atlantos_qc_js')
    }

requires = [
    'bokeh ==3.7.3',     # TODO: there was one issue when selecting samples with the version 3.4.1, waiting for the version 5
    'PyCO2SYS ==1.8.3.4',
    'shapely ==2.1.1',
    'seawater ==3.3.5',
    'more_itertools ==10.7.0',

    # export to SVG, PNG and PDF
    'selenium ==4.35.0',
    'svglib ==1.5.1',
    'reportlab ==4.4.3',

    # world tile map
    'tilecloud ==1.13.2',
    'cachetools ==6.1.0',
    'Flask ==3.1.2',
    'flask-cors ==6.0.1',
]

if sys.platform == "win32":
    requires.append('python-magic-win64 >=0.4.13')  # depends on python-magic and adds the DLL libmagic library

setup(
    name='atlantos_qc',
    version='1.7.0',                                    # TODO: extract the version from package.json
    python_requires='>=3.11',                           # they are still solving bugs in python 3.12
    description='Open source application for assisted primary quality control of hydrographic cruise data focused on carbon and ancillary parameters',
    long_description=open("README.md").read(),          # TODO: check if this is readable in this is publish in a future channel repository or
    long_description_content_type="text/markdown",      #       Python Package Index https://pypi.org/
    keywords="ocean data quality control seawater csv whp",
    url='https://github.com/EuroGO-SHIP/AtlantOS_QC',
    author='Anton Velo / Jesus Cacabelos',
    author_email='avelo@iim.csic.es',
    license='GPL-3.0-or-later',
    install_requires=requires,
    packages=[
        'atlantos_qc',
        'atlantos_qc.bokeh_models',
        'atlantos_qc.data_models',
        'atlantos_qc.data_models.extra',
    ],
    package_data=get_package_data(),
    zip_safe=False,
)
