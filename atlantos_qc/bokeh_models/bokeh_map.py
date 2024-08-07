# -*- coding: utf-8 -*-
#########################################################################
#    License, authors, contributors and copyright information at:       #
#    AUTHORS and LICENSE files at the root folder of this application   #
#########################################################################

from bokeh.models import Range1d, Scatter, CustomJSHover
from bokeh.models.tiles import WMTSTileSource
from bokeh.plotting import figure
from bokeh.models.tools import (
    PanTool, BoxZoomTool, BoxSelectTool, WheelZoomTool,
    LassoSelectTool, CrosshairTool, TapTool, SaveTool,
    HoverTool
)
from bokeh.models.ranges import DataRange1d

from bokeh.util.logconfig import bokeh_logger as lg
from atlantos_qc.env import Environment
from atlantos_qc.constants import *


class BokehMap(Environment):
    ''' Show the stations on a tile map server '''
    env = Environment

    def __init__(self, **kwargs):
        lg.info('-- INIT BOKEH MAP')
        self.env.bk_map = self

        self._init_bokeh_map()
        self._set_tools()

    def _init_bokeh_map(self):
        lg.info('>> TS STATE: {}'.format(self.env.ts_state))
        if self.env.ts_state is None:     # this should not happen, I add it here just in case
            self.env.ts_state = 'online'  # I set online because I cannot run tile server from here
        if self.env.ts_state == 'online':
            tile_options = dict(url=ARGIS_TS)
        else:
            tile_options = dict(url=LOCAL_TS)
        tile_source = WMTSTileSource(**tile_options)

        range_padding = 0.30
        #max_zoom = 50000000
        #min_zoom = 10000

        # TODO: when a profile is selected, the range size is changed??
        x_range = DataRange1d(
            range_padding=range_padding,
            # range_padding_units='absolute',
            #max_interval = max_zoom, min_interval = min_zoom
            bounds=(-20026376.39, 20026376.39)  # longitude bounds for mercator
        )
        y_range = DataRange1d(
            range_padding=range_padding,
            # range_padding_units='absolute',
            #max_interval = max_zoom, min_interval = min_zoom
            bounds=(-20048966.10, 20048966.10) # latitude bounds for mercator
        )

        self.env.wmts_map = figure(
            height=240,
            width=200,
            output_backend=OUTPUT_BACKEND,
            tools='',
            toolbar_location='right',

            x_axis_type='mercator',         # to avoid weird axis numbers
            y_axis_type='mercator',
            y_axis_location='left',
            x_range=x_range,
            y_range=y_range,

            border_fill_color = 'whitesmoke',       # TODO: this should be declared on the yaml file
            background_fill_color = 'whitesmoke'
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

        lasso_select = LassoSelectTool(
            continuous=False,            # enhance performance
        )

        code = """
            var projections = require("core/util/projections");
            var x = special_vars.data_x
            var y = special_vars.data_y
            var coords = projections.wgs84_mercator.inverse([x, y])
            return coords[%d].toFixed(2)
        """

        tooltips = '''
            <style>
                .bk-tooltip>div:not(:nth-child(-n+5)) {{
                    display:none;
                }}

                .bk-tooltip>div {{
                    background-color: #dff0d8;
                    padding: 5px;
                }}
            </style>

            <b>STATION: </b> @{STNNBR} <br />
            <b>LON: </b> @X_WMTS{custom} <br />
            <b>LAT: </b> @Y_WMTS{custom} <br />
        '''

        hover = HoverTool(
            mode='mouse',
            tooltips=tooltips,
            renderers=[self.env.wmts_map_scatter],
            formatters={
                'X_WMTS' : CustomJSHover(code=code % 0),
                'Y_WMTS' : CustomJSHover(code=code % 1),
            }
        )

        tools = (
            pan, box_zoom, lasso_select, hover,
            crosshair, tap, wheel_zoom
        )
        self.env.wmts_map.add_tools(*tools)

        # set defaults
        self.env.wmts_map.toolbar.active_drag = pan
        self.env.wmts_map.toolbar.active_inspect = [crosshair, hover]
        self.env.wmts_map.toolbar.active_scroll = wheel_zoom
        self.env.wmts_map.toolbar.active_tap = tap



