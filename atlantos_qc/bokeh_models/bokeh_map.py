# -*- coding: utf-8 -*-
#########################################################################
#    License, authors, contributors and copyright information at:       #
#    AUTHORS and LICENSE files at the root folder of this application   #
#########################################################################

import zipfile, io, threading, math
from os import path
from flask import Flask, send_file, abort
from flask_cors import CORS
from cachetools import LRUCache, cachedmethod
from operator import attrgetter
from bokeh.models import Scatter, WMTSTileSource, DataRange1d, HoverTool, CustomJSHover
from bokeh.plotting import figure
from bokeh.models.tools import (
    PanTool, BoxZoomTool, BoxSelectTool, WheelZoomTool,
    LassoSelectTool, CrosshairTool, TapTool, SaveTool
)
from bokeh.util.logconfig import bokeh_logger as lg
from atlantos_qc.env import Environment
from atlantos_qc.constants import *

ARGIS_TS = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{Z}/{Y}/{X}/"
LOCAL_TS = "http://127.0.0.1:5000/tiles/{Z}/{X}/{Y}.png"

ETOPO1_Z5 = path.join(TILES, 'etopo1_z5.zip')
WORLD_OCEAN_BASE_Z5 = path.join(TILES, 'world_ocean_base_z5.zip')


def deg2dms(deg, is_lon=True):
    """Convert decimal degrees to DMS string"""
    d = int(abs(deg))
    m = int((abs(deg) - d) * 60)
    s = (abs(deg) - d - m/60) * 3600
    hemi = ''
    if is_lon:
        hemi = 'E' if deg >= 0 else 'W'
    else:
        hemi = 'N' if deg >= 0 else 'S'
    return f"{d}°{m}'{s:.1f} {hemi}"


class BokehMap(Environment):
    ''' Show the stations on a tile map server '''
    env = Environment

    def __init__(self, **kwargs):
        lg.info('-- INIT BOKEH MAP')
        self.env.bk_map = self

        self.zip_path = ETOPO1_Z5  # TODO: get map name from ini file
                                   # TODO: download more levels
        self.tile_cache_size = 200
        self.tile_cache = LRUCache(maxsize=self.tile_cache_size)
        self.zip_file = None
        self.min_zoom = 0
        self.max_zoom = 0

        self._init_local_tile_server()
        self._init_bokeh_map()
        self._set_tools()
        self._compute_dms_columns()

    def _init_local_tile_server(self):
        """Initialize Flask tile server and load ZIP"""
        self.zip_file = zipfile.ZipFile(self.zip_path)
        self._compute_zoom_levels()
        self._start_flask_server()

    def _compute_zoom_levels(self):
        """Compute min and max zoom from ZIP"""
        tiles = self.zip_file.namelist()
        zoom_levels = [int(t.split("/")[0]) for t in tiles]
        self.min_zoom = min(zoom_levels)
        self.max_zoom = max(zoom_levels)
        lg.info(f"Local tiles loaded: min_zoom={self.min_zoom}, max_zoom={self.max_zoom}")

    @cachedmethod(attrgetter('tile_cache'))
    def _read_tile(self, z, x, y):
        """Read a tile from ZIP"""
        key = f"{z}/{x}/{y}"
        return self.zip_file.read(key)

    def _serve_tile(self, z, x, y):
        """Serve a tile with overzoom handling"""
        current_z, current_x, current_y = z, x, y

        if current_z > self.max_zoom:
            # overzoom: calculate parent tile
            zoom_diff = current_z - self.max_zoom
            scale_factor = 2 ** zoom_diff
            current_x = math.floor(x / scale_factor)
            current_y = math.floor(y / scale_factor)
            current_z = self.max_zoom

        try:
            data = self._read_tile(current_z, current_x, current_y)
        except KeyError:
            abort(404)
        return send_file(io.BytesIO(data), mimetype="image/png")

    def _start_flask_server(self):
        """Start Flask tile server in a background thread"""
        app = Flask(__name__)
        CORS(app)

        @app.route("/tiles/<int:z>/<int:x>/<int:y>.png")
        def serve_tile(z, x, y):
            return self._serve_tile(z, x, y)

        def run_flask():
            app.run(port=5000, debug=False, use_reloader=False)

        threading.Thread(target=run_flask, daemon=True).start()
        lg.info("Flask tile server started at http://localhost:5000")

    def _init_bokeh_map(self):
        lg.info('>> TS STATE: {}'.format(self.env.ts_state))
        if self.env.ts_state is None:
            self.env.ts_state = 'online'
        if self.env.ts_state == 'online' or self.zip_path is None:
            tile_url = ARGIS_TS
        else:
            tile_url = LOCAL_TS

        tile_source = WMTSTileSource(
            url=tile_url,
            min_zoom=self.min_zoom,
            max_zoom=self.max_zoom
        )

        # Use bounds from original script to avoid overzoom requests
        range_padding = 0.30
        x_range = DataRange1d(
            range_padding=range_padding,
            bounds=(-20026376.39, 20026376.39)
        )
        y_range = DataRange1d(
            range_padding=range_padding,
            bounds=(-20048966.10, 20048966.10)
        )

        self.env.wmts_map = figure(
            height=240,
            width=200,
            output_backend=OUTPUT_BACKEND,
            tools='',
            toolbar_location='right',
            x_axis_type='mercator',
            y_axis_type='mercator',
            y_axis_location='left',
            x_range=x_range,
            y_range=y_range,
            border_fill_color='whitesmoke',
            background_fill_color='whitesmoke'
        )

        self.env.wmts_map.axis.visible = True
        self.env.wmts_map.add_tile(tile_source)

        self.env.wmts_map_scatter = self.env.wmts_map.scatter(
            x='X_WMTS',
            y='Y_WMTS',
            size=5,
            source=self.env.wmts_map_source,
            line_color='#00004c',
            fill_color='#5bc0de',
            fill_alpha=1.0,
            line_alpha=1.0,
            nonselection_line_color='#00004c',
            nonselection_fill_color='#5bc0de',
            nonselection_fill_alpha=1.0,
            nonselection_line_alpha=1.0,
        )

        self.env.wmts_map_scatter.selection_glyph = Scatter(
            x='X_WMTS',
            y='Y_WMTS',
            line_color=RED,
            line_alpha=1.0,
            fill_color='yellow',
        )

    def _set_tools(self):
        wheel_zoom = WheelZoomTool()
        pan = PanTool()
        box_zoom = BoxZoomTool()
        box_select = BoxSelectTool()
        crosshair = CrosshairTool()
        tap = TapTool()
        save = SaveTool()
        lasso_select = LassoSelectTool(continuous=False)

        # Formatter JS to limit just to 1 tooltip visible
        f = CustomJSHover(code="""
            special_vars.indices = special_vars.indices.slice(0, 1);
            return special_vars.indices.includes(special_vars.index) ? '' : 'hidden';
        """)

        tooltips = """
            <div @STNNBR{custom} style="padding:5px; background-color:#f2f2f2;">
                <b>STATION(S):</b> @{STNNBR} <br>
                <b>LON: </b> @LON_DMS <br>
                <b>LAT: </b> @LAT_DMS <br>
            </div>
        """

        hover = HoverTool(
            mode='mouse',
            point_policy='snap_to_data',
            tooltips=tooltips,
            formatters={'@STNNBR': f},
            renderers=[self.env.wmts_map_scatter]
        )

        tools = (pan, box_zoom, lasso_select, hover, crosshair, tap, wheel_zoom)
        self.env.wmts_map.add_tools(*tools)

        # set defaults
        self.env.wmts_map.toolbar.active_drag = pan
        self.env.wmts_map.toolbar.active_inspect = [crosshair, hover]
        self.env.wmts_map.toolbar.active_scroll = wheel_zoom
        self.env.wmts_map.toolbar.active_tap = tap

        self.env.wmts_map.toolbar.logo = None

    def _compute_dms_columns(self):
        """Compute LAT_DMS and LON_DMS columns for tooltips"""
        def lon_dms(x):
            # Convert Web Mercator x to degrees and then to DMS
            deg = x / 6378137.0 * 180 / math.pi
            return deg2dms(deg, True)

        def lat_dms(y):
            # Convert Web Mercator y to degrees and then to DMS
            deg = (2 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2) * 180 / math.pi
            return deg2dms(deg, False)

        x_vals = self.env.wmts_map_source.data['X_WMTS']
        y_vals = self.env.wmts_map_source.data['Y_WMTS']

        self.env.wmts_map_source.data['LON_DMS'] = [lon_dms(x) for x in x_vals]
        self.env.wmts_map_source.data['LAT_DMS'] = [lat_dms(y) for y in y_vals]