import numpy as np
import pandas as pd
import PyCO2SYS as co2
from shapely.geometry import Point, Polygon
import os
import zlib

from bokeh.util.logconfig import bokeh_logger as lg
from atlantos_qc.constants import *
from atlantos_qc.env import Environment

class PyCANYONB():
    def __init__(self):
        # Get the directory where the current file is located
        self.current_dir = os.path.dirname(os.path.abspath(__file__))
        #
        self.last_params_crc = None
        self.last_results = {}

    def _calculate_crc(self, *args):
        crc = 0
        for arg in args:
            # Convert the argument to bytes for the CRC calculation
            arg_bytes = str(arg).encode('utf-8')
            crc = zlib.crc32(arg_bytes, crc)
        return crc

    def to_numpy_array(self, data):
        if data is None:
            return None
        if isinstance(data, pd.Series):
            return data.to_numpy()
        return np.atleast_1d(data)

    def pycanyonb(self, date=None, lat=None, lon=None, pres=None, temp=None, psal=None, doxy=None,
                param=None, epres=None, etemp=None, epsal=None, edoxy=None):
        out = {}

        # Convert inputs
        date = self.to_numpy_array(date)
        lat = self.to_numpy_array(lat)
        lon = self.to_numpy_array(lon)
        pres = self.to_numpy_array(pres)
        temp = self.to_numpy_array(temp)
        psal = self.to_numpy_array(psal)
        doxy = self.to_numpy_array(doxy)
        year_ =  (date // 10000) + ((date % 10000) // 100 + (date % 100) / 31) / 12

        nol = pres.size

        # Setting up default uncertainties if not provided
        epres = 0.5 if epres is None else epres
        etemp = 0.005 if etemp is None else etemp
        epsal = 0.005 if epsal is None else epsal
        edoxy = 0.01 * doxy if edoxy is None else edoxy

        # Expanding input errors if they are scalar
        epres = np.full_like(pres, epres) if np.isscalar(epres) else epres
        etemp = np.full_like(temp, etemp) if np.isscalar(etemp) else etemp
        epsal = np.full_like(psal, epsal) if np.isscalar(epsal) else epsal
        edoxy = np.full_like(doxy, edoxy) if np.isscalar(edoxy) else edoxy

        # Define parameters
        paramnames = ['AT', 'CT', 'pH', 'pCO2', 'NO3', 'PO4', 'SiOH4']
        noparams = len(paramnames)
        inputsigma = np.array([6, 4, 0.005, np.nan, 2/100, 2/100, 2/100])
        betaipCO2 = np.array([-3.114e-05, 1.087e-01, -7.899e+01])  # ipCO2 absolute; nuts relative
        inputsigma[2] = np.sqrt(0.005**2 + 0.01**2)  # Orr systematic uncertainty

        # Check which parameters to calculate
        paramflag = np.zeros(noparams, dtype=bool)
        if param is None:
            param = paramnames  # Default to all parameters

        # Ensure param is a list of strings
        if isinstance(param, str):
            param = [param]

        calculate_phts25p0 = True
        if 'pHTS25P0' in param:
            co2sys_param = ['AT', 'pH', 'SiOH4', 'PO4']
            misses = set(co2sys_param) - set(param)
            param = list(set(param).union(misses))
            calculate_phts25p0 = True

        # Check for the existence of paramnames in the desired parameter output
        for i in range(noparams):
            paramflag[i] = any([p.lower() == paramnames[i].lower() for p in param])

        # Adjust longitude values
        try:
            lon[lon > 180] -= 360
        except:
            pass

        # Latitude adjustment for Polar shift
        # Defining points for Arctic basin 'West' of Lomonossov ridge
        plon = np.array([-180, -170, -85, -80, -37, -37, 143, 143, 180, 180, -180, -180])
        plat = np.array([68, 66.5, 66.5, 80, 80, 90, 90, 68, 68, 90, 90, 68])
        # Check if points are within the specified polygon
        polygon = Polygon(zip(plon, plat))
        # Assuming lon and lat are defined as numpy arrays of the same length

        for i in range(lon.size):
            point = Point(lon[i], lat[i])
            arcflag = polygon.contains(point)
            arcedgeflag = polygon.boundary.contains(point)

        # Convert to numpy arrays for element-wise operations
        arcflag = np.array(arcflag)
        arcedgeflag = np.array(arcedgeflag)

        # Exclude edges
        arcflag = arcflag & ~arcedgeflag

        # Modify lat values based on the condition
        lat[arcflag] -= np.sin(np.radians(lon[arcflag] + 37)) * (90 - lat[arcflag]) * 0.5

        # Prepare input data
        data = np.column_stack([
            year_, lat / 90, np.abs(1 - np.mod(lon - 110, 360) / 180),
            np.abs(1 - np.mod(lon - 20, 360) / 180), temp, psal, doxy,
            pres / 20000 + 1 / ((1 + np.exp(-pres / 300)) ** 3)
        ])

        no = 1  # Number of outputs, one at a time

        # Loop through all CANYON-B variables
        for i in range(noparams):
            if paramflag[i]:  # Calculate only desired parameters
                # Load weights and other data from file
                weight_file = f'{self.current_dir}/wgts_{paramnames[i]}.txt'
                inwgts = np.loadtxt(weight_file)
                noparsets = inwgts.shape[1] - 1  # Number of networks in committee

                # Input normalization
                if i > 3:  # Nuts
                    ni = data.shape[1] - 1  # Number of inputs (excluding year)
                    ioffset = -1
                    mw = inwgts[:ni + 1, -1]
                    sw = inwgts[ni + 1:2 * ni + 2, -1]
                    data_N = (data[:, 1:] - (mw[:ni, np.newaxis] * np.ones(nol)).T) / (sw[:ni, np.newaxis] * np.ones(nol)).T  # Normalizing data (excluding year)
                else:
                    # Input normalization for carbonate system
                    ni = data.shape[1]  # Number of inputs
                    ioffset = 0
                    mw = inwgts[:ni + 1, -1]
                    sw = inwgts[ni + 1:2 * ni + 2, -1]
                    data_N = (data - (mw[:ni, np.newaxis] * np.ones(nol)).T) / (sw[:ni, np.newaxis] * np.ones(nol)).T   # Normalizing data

                # Loading weights
                wgts = inwgts[3, :noparsets]
                betaciw = inwgts[2 * ni + 2:, noparsets]
                betaciw = betaciw[~np.isnan(betaciw)]

                # Preallocations
                cval = np.full((nol, noparsets), np.nan)
                cvalcy = np.full((1, noparsets), np.nan)
                inval = np.full((nol, ni, noparsets), np.nan)

                # Cycling through all networks of given variable
                for l in range(noparsets):
                    # Check if hidden layer 2 exists
                    nlayerflag = 1 + bool(inwgts[1, l])
                    nl1 = int(inwgts[0, l])
                    nl2 = int(inwgts[1, l])
                    beta = inwgts[2, l]
                    # Weights and biases for the first layer
                    w1 = inwgts[4:4 + nl1 * ni, l].reshape(ni, nl1).T
                    b1 = inwgts[4 + nl1 * ni:4 + nl1 * (ni + 1), l]
                    # Weights and biases for the second layer
                    w2 = inwgts[4 + nl1 * (ni + 1):4 + nl1 * (ni + 1) + nl2 * nl1, l].reshape(nl1,nl2).T
                    b2 = inwgts[4 + nl1 * (ni + 1) + nl2 * nl1:4 + nl1 * (ni + 1) + nl2 * (nl1 + 1), l]

                    if nlayerflag == 2:
                        # Weights and biases for the third layer (if it exists)
                        w3 = inwgts[4 + nl1 * (ni + 1) + nl2 * (nl1 + 1):4 + nl1 * (ni + 1) + nl2 * (nl1 + 1) + no * nl2, l].reshape(nl2,no).T
                        b3 = inwgts[4 + nl1 * (ni + 1) + nl2 * (nl1 + 1) + no * nl2:4 + nl1 * (ni + 1) + nl2 * (nl1 + 1) + no * (nl2 + 1), l]

                    # Neural network computations
                    if nlayerflag == 1:
                        # One hidden layer
                        a = data_N.dot(w1.T) + b1.T
                        y = np.tanh(a).dot(w2.T) + b2.T
                    elif nlayerflag == 2:
                        # Two hidden layers
                        a = data_N.dot(w1.T) + b1.T
                        b = np.tanh(a).dot(w2.T) + b2.T
                        y = np.tanh(b).dot(w3.T) + b3.T

                    # Collect outputs
                    cval[:, l] = y.flatten()
                    cvalcy[:, l] = 1 / beta  # 'noise' variance

                # Denormalization of the network output
                cval = cval * sw[ni] + mw[ni]
                cvalcy = cvalcy * sw[ni] ** 2

                # Add committee of all params_crc as evidence-weighted mean
                V1 = np.sum(wgts)
                V2 = np.sum(wgts ** 2)
                out[paramnames[i]] = np.sum(np.tile(wgts.reshape(1, -1), (nol, 1)) * cval, axis=1) / V1  # Weighted mean
                #cvalcu = np.sum(wgts[:, None] * (cval - out[paramnames[i]][:, None]) ** 2, axis=1) / (V1 - V2 / V1)  # CU variance
                out[paramnames[i]] = np.reshape(out[paramnames[i]], pres.shape)

                # Recalculate pCO2 if necessary
                if i == 3:
                    outcalc = co2.sys(par1=2300, par2=out[paramnames[i]].flatten(), par1_type=1, par2_type=2,
                            salinity=35,
                            temperature=25, pressure=0,
                            temperature_out=temp, pressure_out=pres,
                            )['pCO2']
                    out[paramnames[i]] = np.reshape(outcalc, pres.shape)

            # End of loop for paramflag

        # Additional calculations if calculate_phts25p0 is True
        if calculate_phts25p0:
            outcalc = co2.sys(par1=out['AT'], par2=out['pH'], par1_type=1, par2_type=3,
                        salinity=35,
                        temperature=temp, pressure=pres,
                        temperature_out=25, pressure_out=0,
                        )['pH_out']
            out['pHTS25P0'] = np.reshape(outcalc, pres.shape)
        return out

    def nitrat_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('NO3', None)

    def phspht_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('PO4', None)

    def silcat_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('SiOH4', None)

    def alkali_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('AT', None)

    def tcarbn_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('CT', None)

    def pco2_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('pCO2', None)

    def ph_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('pH', None)

    def phts25p0_nncanyonb_bit18(self, DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY):
        params_crc = self._calculate_crc(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
        if params_crc != self.last_params_crc:
            self.last_results = self.pycanyonb(DATE, LATITUDE, LONGITUDE, PRES, CTDTMP, SAL, OXY)
            self.last_params_crc = params_crc
        return self.last_results.get('pHTS25P0', None)