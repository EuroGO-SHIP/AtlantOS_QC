# -*- coding: utf-8 -*-
#########################################################################
#    License, authors, contributors and copyright information at:       #
#    AUTHORS and LICENSE files at the root folder of this application   #
#########################################################################

from bokeh.io.export import export_svg, export_png
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from svglib.svglib import svg2rlg
from svglib.fonts import FontMap
from reportlab.graphics import renderPDF
import os
from os import path
from pathlib import Path
import zipfile

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

from atlantos_qc.env import Environment
from atlantos_qc.constants import *
from bokeh.util.logconfig import bokeh_logger as lg


class BokehExport(Environment):
    ''' Export plots in PNG, SVG. All files will be gathered in a ZIP file or PDF
    '''
    env = Environment

    def __init__(self, **kwargs):
        lg.info('-- INIT BOKEH EXPORT')
        self.env.bk_export = self

    def export_pdf(self):
        lg.info('EXPORT PDF')
        self._prep_directory()
        self._prep_driver()

        self._export_all_svg()

        page_size = A4
        page_width, page_height = page_size
        margin = 50
        spacing_x = 20
        spacing_y = 30
        col_count = 2

        custom_font_map = FontMap()
        custom_font_map.register_font(font_family='helvetica', rlgFontName='Helvetica')
        custom_font_map.register_font(font_family='helvetica', weight='bold', rlgFontName='Helvetica-Bold')

        pdf_file = path.join(EXPORT, "plots.pdf")
        c = canvas.Canvas(pdf_file, pagesize=page_size)

        for panel in self.env.tabs_widget.tabs:
            tab_name = panel.title
            # FIX: use same extraction as export_all_svg
            figures = [tup[0] for tup in panel.child.children]

            c.setFont("Helvetica-Bold", 16)
            c.drawString(margin, page_height - margin, tab_name)

            x_positions = [margin, page_width / 2 + spacing_x / 2]
            y = page_height - margin - 40

            col = 0
            for fig in figures:
                svg_file = self.fig_to_file.get(fig)
                if not svg_file or not path.exists(svg_file):
                    continue

                drawing = svg2rlg(svg_file, font_map=custom_font_map)

                scale = (page_width / 2 - margin - spacing_x / 2) / drawing.width
                drawing.width *= scale
                drawing.height *= scale
                drawing.scale(scale, scale)

                renderPDF.draw(drawing, c, x_positions[col], y - drawing.height)
                col += 1

                if col >= col_count:
                    col = 0
                    y -= drawing.height + spacing_y

                if y - drawing.height < margin:
                    c.showPage()
                    y = page_height - margin
                    c.setFont("Helvetica-Bold", 16)
                    c.drawString(margin, page_height - margin, tab_name)

            c.showPage()

        c.save()
        return {'success': True, 'pdf_file': pdf_file}

    def _set_export_state(self, fig, format):
        """Save current state and set figure ready for export."""
        state = {
            "output_backend": fig.output_backend,
            "background_fill_color": fig.background_fill_color,
            "border_fill_color": fig.border_fill_color,
        }
        if format == 'svg':
            fig.output_backend = "svg"
        fig.background_fill_color = None
        fig.border_fill_color = None
        return state


    def _restore_state(self, fig, state):
        """Restore figure to saved state."""
        fig.output_backend = state["output_backend"]
        fig.background_fill_color = state["background_fill_color"]
        fig.border_fill_color = state["border_fill_color"]


    def _export_all_svg(self):
        self.fig_to_file = {}
        counter = 1
        for panel in self.env.tabs_widget.tabs:
            figures = [tup[0] for tup in panel.child.children]
            for fig in figures:
                state = self._set_export_state(fig, 'svg')

                filename = path.join(EXPORT, f"figure{counter}.svg")
                export_svg(fig, filename=filename)
                self.fig_to_file[fig] = filename

                self._restore_state(fig, state)

                x_title = fig.xaxis[0].axis_label if fig.xaxis and fig.xaxis[0].axis_label else "No X label"
                y_title = fig.yaxis[0].axis_label if fig.yaxis and fig.yaxis[0].axis_label else "No Y label"
                lg.info(f'TAB="{panel.title}" | X="{x_title}" | Y="{y_title}"')

                counter += 1

    def export_svg_as_zip(self):
        self._prep_directory()
        self._prep_driver()
        self._export_all_svg()

        zip_path = path.join(EXPORT, 'plots_svg.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in os.listdir(EXPORT):
                if file.lower().endswith(".svg"):
                    full_path = path.join(EXPORT, file)
                    zipf.write(full_path, arcname=file)  # arcname avoids absolute paths
        return {'success': True, 'zip_file': zip_path}


    def _export_all_png(self):
        self.fig_to_file = {}
        counter = 1
        for panel in self.env.tabs_widget.tabs:
            figures = [tup[0] for tup in panel.child.children]
            for fig in figures:
                state = self._set_export_state(fig, 'png')

                filename = path.join(EXPORT, f"figure{counter}.png")
                export_png(fig, filename=filename)
                self.fig_to_file[fig] = filename

                self._restore_state(fig, state)

                x_title = fig.xaxis[0].axis_label if fig.xaxis and fig.xaxis[0].axis_label else "No X label"
                y_title = fig.yaxis[0].axis_label if fig.yaxis and fig.yaxis[0].axis_label else "No Y label"
                lg.info(f'TAB="{panel.title}" | X="{x_title}" | Y="{y_title}"')

                counter += 1

    def export_png_as_zip(self):
        self._prep_directory()
        self._prep_driver()
        self._export_all_png()

        zip_path = path.join(EXPORT, 'plots_png.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in os.listdir(EXPORT):
                if file.lower().endswith(".png"):
                    full_path = path.join(EXPORT, file)
                    zipf.write(full_path, arcname=file)  # arcname avoids absolute paths
        return {'success': True, 'zip_file': zip_path}

    def _prep_directory(self):
        if not path.exists(EXPORT):
            os.mkdir(EXPORT)
        else:
            for the_file in os.listdir(EXPORT):
                file_path = path.join(EXPORT, the_file)
                if path.isfile(file_path):
                    os.unlink(file_path)

    def _find_executable(self, root: Path, exe_name: str) -> Path:
        """
        Search recursively inside root for an executable named exe_name.
        Assumes there are always two levels of folders before the executable.
        """
        for first in root.iterdir():
            if not first.is_dir():
                continue
            for second in first.iterdir():
                if not second.is_dir():
                    continue
                candidate = second / exe_name
                if candidate.exists():
                    return candidate
        raise FileNotFoundError(f"Could not find {exe_name} in {root}")

    def _prep_driver(self):
        browser_dir = Path(ATLANTOS_QC_JS) / "src" / "browser"

        chrome_name = "chrome.exe" if os.name == "nt" else "chrome"
        chromedriver_name = "chromedriver.exe" if os.name == "nt" else "chromedriver"

        chrome_path = self._find_executable(browser_dir / "chrome", chrome_name)
        chromedriver_path = self._find_executable(browser_dir / "chromedriver", chromedriver_name)

        lg.info(f'Preparing Selenium driver...')
        lg.info(f'Chrome binary path: {chrome_path}')
        lg.info(f'Chromedriver path: {chromedriver_path}')

        # Add Chromedriver folder to PATH
        os.environ["PATH"] += os.pathsep + str(chromedriver_path.parent)
        lg.info(f'Added Chromedriver folder to PATH: {chromedriver_path.parent}')

        # Selenium options
        chrome_options = Options()
        chrome_options.binary_location = str(chrome_path)
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")

        # Create driver
        service = Service(str(chromedriver_path))
        self.driver = webdriver.Chrome(service=service, options=chrome_options)
        lg.info('Selenium Chrome driver initialized successfully.')
