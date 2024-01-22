# -*- coding: utf-8 -*-
#########################################################################
#    License, authors, contributors and copyright information at:       #
#    AUTHORS and LICENSE files at the root folder of this application   #
#########################################################################

import shutil
import sys
import fnmatch
import os
import pathlib
from datetime import datetime
import pandas as pd
import numpy as np
import seawater as sw
import importlib
from scipy import stats
import PyCO2SYS as co2
import time

from bokeh.util.logconfig import bokeh_logger as lg
from ocean_data_qc.constants import *
from ocean_data_qc.env import Environment
from ocean_data_qc.data_models.extra.pycanyonb import PyCANYONB
from ocean_data_qc.data_models.extra.extra_params import ExtraParams

pycanyonb = PyCANYONB()
extra_params = ExtraParams()

class OctaveEquations(Environment):
    env = Environment

    def __init__(self):
        lg.info('-- INIT OCTAVE EXECUTABLE')
        self.env.oct_eq = self
        self.oc = None
        self.oct_exe_path = False

    def _get_regular_oct_folder(self):
        start_time = time.time()
        s = r'C:\Program Files\GNU Octave'
        try:
            for d in os.listdir(s):
                if d.startswith('Octave-'):
                    folder = os.path.join(s, d)
                    lg.info(f'GET REGULAR OCTAVE FOLDER: {folder} -- {time.time() - start_time:.3f}s')
                    return folder
        except:
            return ''


    def guess_oct_exe_path(self):
        lg.info('-- GUESS OCT EXE PATH --')
        if sys.platform == 'win32':
            self._find_octave_windows()
        elif sys.platform == 'darwin':  # macOS
            self._find_octave_mac()
        else:  # Assuming Linux
            self._find_octave_linux()

        if self.oct_exe_path:
            # self.oct_exe_path = pathlib.Path(self.oct_exe_path).as_uri()
            return self.set_oct_exe_path()
        else:
            return {'octave_path': False}

    def _find_octave_windows(self):
        start_time = time.time()
        # First, check if octave-cli.exe is in PATH
        path_in_path = shutil.which('octave-cli.exe')
        if path_in_path:
            self.oct_exe_path = path_in_path
            lg.info('-- OCTAVE IN PATH')
            return

        # Check common directories
        common_dirs = [
            self._get_regular_oct_folder(),
            r'C:\Octave'
        ]

        for base_dir in common_dirs:
            if os.path.isdir(base_dir):
                lg.info(f'-- OCTAVE TRYING: {base_dir}')
                for version_dir in sorted(os.listdir(base_dir), reverse=True):
                    possible_paths = [
                        os.path.join(base_dir, version_dir, 'mingw64', 'bin', 'octave-cli.exe'),
                        os.path.join(base_dir, version_dir, 'bin', 'octave-cli.exe'),
                        os.path.join(base_dir, version_dir, 'mingw32', 'bin', 'octave-cli.exe')
                    ]
                    for path in possible_paths:
                        if os.path.isfile(path):
                            self.oct_exe_path = path
                            lg.info(f'took {time.time() - start_time:.3f}s')
                            return

    def _find_octave_mac(self):
        start_time = time.time()
        # First, check if octave-cli is in PATH
        path_in_path = shutil.which('octave-cli')
        if path_in_path:
            self.oct_exe_path = path_in_path
            lg.info(f'took {time.time() - start_time:.3f}s')
            return

        # Check /usr/local/bin/octave-cli
        if os.path.isfile('/usr/local/bin/octave-cli'):
            self.oct_exe_path = '/usr/local/bin/octave-cli'
            lg.info(f'took {time.time() - start_time:.3f}s')
            return

        # Check /Applications
        if os.path.isdir('/Applications'):
            for dname in os.listdir('/Applications'):
                if fnmatch.fnmatch(dname, 'Octave-*'):
                    potential_path = os.path.join('/Applications', dname, 'Contents/Resources/usr/bin/octave-cli')
                    if os.path.isfile(potential_path):
                        self.oct_exe_path = potential_path
                        lg.info(f'took {time.time() - start_time:.3f}s')
                        return

    def _find_octave_linux(self):
        start_time = time.time()
        # First, check if octave-cli is in PATH
        path_in_path = shutil.which('octave-cli')
        if path_in_path:
            self.oct_exe_path = path_in_path
            lg.info(f'took {time.time() - start_time:.3f}s')
            return

        # Add other potential common paths or logic for Linux if needed

    def set_oct_exe_path(self, path=None):
        start_time = time.time()
        lg.info('-- SET OCT EXE PATH')

        if path is not None:
            if sys.platform == 'win32':
                if os.path.basename(path) != 'octave-cli.exe':
                    self.oct_exe_path = os.path.join(path, 'octave-cli.exe')
                else:
                    self.oct_exe_path = path
            else:
                if os.path.basename(path) != 'octave-cli':
                    self.oct_exe_path = os.path.join(path, 'octave-cli')
                else:
                    self.oct_exe_path = path

        if self.oct_exe_path:
            lg.info(f'OCTAVE PATH: {path}')  # escape spaces
            os.environ['OCTAVE_EXECUTABLE'] = self.oct_exe_path
            try:
                oct2py_lib = importlib.import_module('oct2py')
                self.oc = oct2py_lib.octave
                self.oc.addpath(os.path.join(OCEAN_DATA_QC_PY, 'octave'))
                # Not needed # self.oc.addpath(os.path.join(OCEAN_DATA_QC_PY, 'octave', 'CANYON-B'))
                return {'octave_path': self.oct_exe_path}
            except Exception as e:
                lg.error('>> oct2py LIBRARY COULD NOT BE IMPORTED, OCTAVE PATH WAS NOT SET CORRECTLY')
        lg.info(f'took {time.time() - start_time:.3f}s')
        return {'octave_path': False}

    def pressure_combined(self, CTDPRS, DEPTH, LATITUDE):
        pressure = -1 * CTDPRS
        #pres_from_depth = sw.pres(DEPTH, LATITUDE)
        #pressure[np.isnan(pressure)] = pres_from_depth[np.isnan(pressure)]
        return pressure

    def depth_combined(self, CTDPRS, DEPTH, LATITUDE):
        #depth = DEPTH
        depth_from_pres = -1 * sw.dpth(CTDPRS, LATITUDE)
        #depth[np.isnan(depth)] = depth_from_pres[np.isnan(depth)]
        return depth_from_pres

    def nitrate_combined(self):
        ''' NO2_NO3 is the sum of NITRAT and NITRIT, sometimes both are reported separately.
            Some other times we need to get the NITRATE from the difference NO2_NO3 - NITRIT.
            NO2_NO3 exists because there are some devices that take the measures together.
            The values of NITRIT are always tiny. If the column does not exist we can do NITRATE = NO2_NO3.
        '''
        msg = ''
        ret = None
        df = self.env.cruise_data.df
        NITRAT = True
        if 'NITRAT' not in df or ('NITRAT' in df and df['NITRAT'].isnull().all()):
            NITRAT = False

        NITRIT = True
        if 'NITRIT' not in df or ('NITRIT' in df and df['NITRIT'].isnull().all()):
            NITRIT = False

        NO2_NO3 = True
        if 'NO2_NO3' not in df or ('NO2_NO3' in df and df['NO2_NO3'].isnull().all()):
            NO2_NO3 = False

        if NO2_NO3 and not NITRAT:
            if NITRIT:
                ret = df['NO2_NO3'] - ~pd.isnull(df['NITRIT'])
                msg = '_NITRATE created from the calculation NO2_NO3 - NITRIT'
            else:
                ret = df['NO2_NO3']
                msg = '_NITRATE created from the NO2_NO3, NITRITE and NITRATE columns are missing'
        elif NITRAT:
            ret = df['NITRAT']
            msg = '_NITRATE was copied from the NITRAT column'
        else:  # not NITRAT and not NO2_NO3
            ret = pd.Series([np.nan] * len(df.index))
            msg = '_NITRATE is an empty column because NITRAT and NO2_NO3 columns do not exist or they are all NaN'

        self.env.cruise_data.add_moves_element('column_combined', msg)
        lg.warning(f'>> {msg}')
        return ret

    def salinity_combined(self):
        return self.column_combined(
            msg='Salinity combined in the column _SALINITY.',
            col1='CTDSAL', col2='SALNTY'
        )

    def oxygen_combined(self):
        return self.column_combined(
            msg='Oxygen combined in the column _OXYGEN.',
            col1='CTDOXY', col2='OXYGEN'
        )

    def column_combined(self, msg, col1, col2):
        ''' @msg - the beginning of the message that is shown in the actions history
            @col1 - the first column name to combine, more precise than the second
            @col1 - the second column name to combine
        '''
        msg = msg
        df = self.env.cruise_data.df.copy()
        COL1 = True
        if col1 not in df or (col1 in df and df[col1].isnull().all()):
            COL1 = False

        COL2 = True
        if col2 not in df or (col2 in df and df[col2].isnull().all()):
            COL2 = False

        if COL1 and not COL2:
            ret = df[col1].to_numpy()
            ret[(df[f'{col1}{FLAG_END}'] > 2) & (df[f'{col1}{FLAG_END}'] != 6)] = np.nan
            msg += f' {col1} was taken because {col2} is empty or does not exist.'
            msg += ' Values with flags 3, 4 and 5 were set to NaN.'
        elif COL2 and not COL1:
            ret = df[col2].to_numpy()
            ret[(df[f'{col2}{FLAG_END}'] > 2) & (df[f'{col2}{FLAG_END}'] != 6)] = np.nan
            msg += f' {col2} was taken because {col1} is empty or does not exist.'
            msg += ' Values with flags 3, 4 and 5 were set to NaN.'
        elif not COL2 and not COL1:
            ret = pd.Series([np.nan] * len(df.index))
            msg += f' {col1} and {col2} do not exist'
        else:
            col1_arr = df[col1].to_numpy()
            # TODO: inform if there is some change here to the user
            col1_arr[(df[f'{col1}{FLAG_END}'] > 2) & (df[f'{col1}{FLAG_END}'] != 6)] = np.nan
            col2_arr = df[col2].to_numpy()
            col2_arr[(df[f'{col2}{FLAG_END}'] > 2) & (df[f'{col2}{FLAG_END}'] != 6)] = np.nan
            msg += f' Values from {col1} and {col2} columns with flags 3, 4 and 5 were set to NaN.'

            dev = np.nanmean(np.abs(col1_arr - col2_arr))
            col2_nonnans = np.sum(~np.isnan(col2_arr)) / np.size(col2_arr)

            if col2_nonnans > 0.8:
                msg += f'Use {col2} as more {col2_nonnans * 100}% of data has it.'
                ret = col2_arr
            if dev < 0.003:
                msg += f' Gaps filled with {col1} as mean deviation is {dev:.4f}'
                ret = np.where(~np.isnan(col2_arr), col2_arr, col1_arr)
            else:
                mask = ~np.isnan(col2_arr) & ~np.isnan(col1_arr)
                slope, intercept, r_value, p_value, std_err = stats.linregress(col1_arr[mask], col2_arr[mask])
                rsq = r_value * r_value
                if rsq > 0.99:
                    msg = msg + f' Calibrating {col1} (R^2={rsq:.3f}) to filll gaps as mean deviation is {dev:.4f}'
                    calibrated_ctd = slope * col1_arr + intercept
                    ret = np.where(~np.isnan(col2_arr), col2_arr, calibrated_ctd)
                else:
                    msg += f' Not filling gaps with {col1} as mean deviation is {dev:.4f} and trying to calibrate gots a R^2={rsq:.3f}'
                    ret = col2_arr

        self.env.cruise_data.add_moves_element('column_combined', msg)
        lg.warning(f'>> {msg}')
        return ret

    def aou_gg(self, SAL, THETA, OXY):
        #ret = self.oc.aou_gg(np.transpose(np.vstack((SAL, THETA, OXY))))
        return extra_params.aou_gg(SAL, THETA, OXY)

    #def tcarbn_from_alkali_phsws25p0(self, ALKALI, PH_SWS, SAL, SILCAT, PHSPHT):
    #    ret = self.oc.tcarbn_from_alkali_phsws25p0(np.transpose(np.vstack((ALKALI, PH_SWS, SAL, SILCAT, PHSPHT))))
    #    return ret
    def tcarbn_from_alkali_phsws25p0(self, ALKALI, PH_SWS, SAL, SILCAT, PHSPHT):
        ret = co2.sys(par1=ALKALI, 
                         par2=PH_SWS, 
                         par1_type=1, 
                         par2_type=3,
                         opt_pH_scale=2,
                         salinity=SAL, 
                         temperature=25,  # Assuming a constant temperature
                         pressure=0,  # Assuming surface pressure
                         total_silicate=SILCAT, 
                         total_phosphate=PHSPHT)['dic']
        return ret       
    
    def tcarbn_from_alkali_phts25p0(self, ALKALI, PH_TOT, SAL, SILCAT, PHSPHT):
        #ret = self.oc.tcarbn_from_alkali_phts25p0(np.transpose(np.vstack((ALKALI, PH_TOT, SAL, SILCAT, PHSPHT))))
        ret = co2.sys(par1=ALKALI, 
                         par2=PH_TOT, 
                         par1_type=1, 
                         par2_type=3,
                         opt_pH_scale=1,
                         salinity=SAL, 
                         temperature=25,  # Assuming a constant temperature
                         pressure=0,  # Assuming surface pressure
                         total_silicate=SILCAT, 
                         total_phosphate=PHSPHT)['dic']
        return ret

    def phts25p0_from_alkali_tcarbn(self, ALKALI, TCARBN, SAL, SILCAT, PHSPHT):
        #ret = self.oc.phts25p0_from_alkali_tcarbn(np.transpose(np.vstack((ALKALI, TCARBN, SAL, SILCAT, PHSPHT))))
        ret = co2.sys(par1=ALKALI, 
                    par2=TCARBN, 
                    par1_type=1, 
                    par2_type=2,
                    opt_pH_scale=1,
                    salinity=SAL, 
                    temperature=25,  # Assuming a constant temperature
                    pressure=0,  # Assuming surface pressure
                    total_silicate=SILCAT, 
                    total_phosphate=PHSPHT)['pH']
        return ret

    def alkali_nng2_vel13(self, LONGITUDE, LATITUDE, DPTH, THETA, SAL, NITRAT, PHSPHT, SILCAT, OXY):
        #ret = np.transpose(self.oc.alkali_nng2_vel13(
        #    np.vstack((LONGITUDE, LATITUDE, -1 * DPTH, THETA, SAL, NITRAT, PHSPHT, SILCAT, OXY))))
        return extra_params.alkali_nng2_vel13(LONGITUDE, LATITUDE, DPTH, THETA, SAL, NITRAT, PHSPHT, SILCAT, OXY)

    def alkali_nngv2_bro19(self, LONGITUDE, LATITUDE, DPTH, THETA, SAL, NITRAT, PHSPHT, SILCAT, OXY):
        #ret = np.transpose(self.oc.alkali_nngv2_bro19(
        #    np.vstack((LATITUDE, np.cos(np.deg2rad(LONGITUDE)), np.sin(np.deg2rad(LONGITUDE)), -1 * DPTH, THETA, SAL, PHSPHT, NITRAT, SILCAT, OXY))))
        return extra_params.alkali_nngv2_bro19(LONGITUDE, LATITUDE, DPTH, THETA, SAL, NITRAT, PHSPHT, SILCAT, OXY)

    def tcarbn_nngv2ldeo_bro20(self, LONGITUDE, LATITUDE, DPTH, THETA, SAL, NITRAT, PHSPHT, SILCAT, OXY, DATE):
        #ret = np.transpose(self.oc.tcarbn_nngv2ldeo_bro20(
        #    np.vstack((LATITUDE, np.cos(np.deg2rad(LONGITUDE)), np.sin(np.deg2rad(LONGITUDE)), -1 * DPTH, THETA, SAL, PHSPHT, NITRAT, SILCAT, OXY, YEAR))))
        return extra_params.tcarbn_nngv2ldeo_bro20(LONGITUDE, LATITUDE, DPTH, THETA, SAL, NITRAT, PHSPHT, SILCAT, OXY, DATE)

    def nitrat_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        #return self.oc.nitrat_nncanyonb_bit18(np.transpose(np.vstack((DATE.to_numpy() // 10000, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY))))
        return pycanyonb.nitrat_nncanyonb_bit18(DATE, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY)

    def phspht_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        #return self.oc.phspht_nncanyonb_bit18(np.transpose(np.vstack((DATE.to_numpy() // 10000, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY))))
        return pycanyonb.phspht_nncanyonb_bit18(DATE, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY)

    def silcat_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        #return self.oc.silcat_nncanyonb_bit18(np.transpose(np.vstack((DATE.to_numpy() // 10000, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY))))
        return pycanyonb.silcat_nncanyonb_bit18(DATE, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY)

    def alkali_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        #return self.oc.alkali_nncanyonb_bit18(np.transpose(np.vstack((DATE.to_numpy() // 10000, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY))))
        return pycanyonb.alkali_nncanyonb_bit18(DATE, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY)
    
    def tcarbn_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        #return self.oc.tcarbn_nncanyonb_bit18(np.transpose(np.vstack((DATE.to_numpy() // 10000, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY))))
        return pycanyonb.tcarbn_nncanyonb_bit18(DATE, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY)

    def phts25p0_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        #return self.oc.phts25p0_nncanyonb_bit18(np.transpose(np.vstack((DATE.to_numpy() // 10000, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY))))
        return pycanyonb.phts25p0_nncanyonb_bit18(DATE, LATITUDE, LONGITUDE, -1 * PRES, CTDTMP, SAL, OXY)
