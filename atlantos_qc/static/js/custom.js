
window.onunhandledrejection = function(event) {
    window.top.postMessage({
        signal: 'unhandled-exception',
        message: 'Unhandled promise rejection:\n' + event.reason
    }, '*');
};

window.onerror = function(message, source, lineNumber, colno, error) {
    // https://github.com/bokeh/bokeh/issues/13959
    if (error.name !== 'TypeError' && error.message !== 'this.plot_view.reset is not a function') {
        window.top.postMessage({
            signal: 'unhandled-exception',
            message: error.stack
        }, '*');
    }
};

function get_input_bridge_text() {
    var models = window.Bokeh.index[Object.keys(window.Bokeh.index)[0]].model.document._all_models;
    var model_id = null;

    // models is a Map object (different from an Object)
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
    models.forEach(function (m, key) {
        if (m.name == 'bridge_text_input') {
            model_id = key;
        }
    });
    return models.get(model_id);
}

oldLog = console.log;
console.log = function (message) {
    if(message.localeCompare('Bokeh items were rendered successfully') == 0){
        window.top.postMessage('bokeh-loaded', '*');
        console.log = oldLog;
    }
    oldLog.apply(console, arguments);
};

$(window).keydown(function(event){
    if(event.keyCode == 13) {
        event.preventDefault();
        return false;
    }
    if(event.keyCode == 27) {
        event.preventDefault();
        window.top.postMessage({
            'signal': 'esc-pressed',
        }, '*');                        // to main_renderer.js
        return false;
    }
});

window.onmessage = function(e){
    if (typeof(e.data.signal) != "undefined") {
        console.log('THE SIGNAL ARRIVED: ' + e.data.signal)
        if (e.data.signal == 'call-python-promise' || e.data.signal == 'update-bridge-text-value') {
            // this updates dummy text field value and triggers the click event of the bridge_button

            // NOTE: This cannot be replaced defining the onchange event of the dummy text, imagine that
            //       you want to run the same action twice, there wouldn't be change on the value to trigger
            //       the python method

            var input_bridge_text = get_input_bridge_text();
            input_bridge_text.value = JSON.stringify(e.data.message_data);

            var bridge_row_host = $('.bridge_row');
            var bridge_row_root = bridge_row_host.get(0).shadowRoot;

            var bk_column_host = $(bridge_row_root).find('.bk-Column');
            var bk_column_root = bk_column_host.get(0).shadowRoot;

            // var bridge_button_host = $(bridge_row_root).find('.bridge_button>div>button')
            var bridge_button_host = $(bk_column_root).find('.bridge_button');
            var bridge_button_root = bridge_button_host.get(0).shadowRoot;
            var button = $(bridge_button_root).find('div>button');
            button.click();

        } else if (e.data.signal == 'on-ready') {
            console.log('ON READY');

            // NOTE: This is executed (kind of hacky) in order to add styles to the checkboxes
            //       There should be to add them in a more elegant way
            //       Check the bokeh example where fontawesome is used to set custom icons to buttons

            // ------ FIXED PROFILES CHECKBOX ------

            // get current original top absolute position of checkboxes

            var new_fp_cb = $('<div>', {
                class: 'abc-checkbox abc-checkbox-primary bk-fixed-profiles-cb',
            });
            new_fp_cb.append(
                $('<input>', {
                    id: 'id_fixed_profiles_cb',
                    type: 'checkbox'
                })
            );
            new_fp_cb.append(
                $('<label>', {
                    for: 'id_fixed_profiles_cb',
                    text: 'Fixed profiles'
                })
            );
            $('.fixed_profiles_cb').before(new_fp_cb);

            $('#id_fixed_profiles_cb').change(function() {
                if(this.checked) {
                    $('.fixed_profiles_cb input').click();
                } else {
                    $('.fixed_profiles_cb input').click();
                }
            });
            fix_prof_top = parseInt($('.flags_control_col').css('height')) + 15 + 'px'
            $('.bk-fixed-profiles-cb').css('top', fix_prof_top)

            // ------ SHOW NEARBY STATION CHECKBOX -----

            var new_sns_cb = $('<div>', {
                class: 'abc-checkbox abc-checkbox-primary bk-show-nearby-station-cb',
            });

            new_sns_cb.append(
                $('<input>', {
                    id: 'id_show_nearby_station_cb',
                    type: 'checkbox'
                })
            );
            new_sns_cb.append(
                $('<label>', {
                    for: 'id_show_nearby_station_cb',
                    text: 'Show nearby station'
                })
            );
            $('.show_nearby_station_cb').before(new_sns_cb);

            $('#id_show_nearby_station_cb').change(function() {
                if(this.checked) {
                    $('.show_nearby_station_cb input').click();
                } else {
                    $('.show_nearby_station_cb input').click();
                }
            });
            show_near_stt_top = parseInt($('.flags_control_col').css('height')) + 35 + 'px'
            $('.bk-show-nearby-station-cb').css('top', show_near_stt_top)

            window.top.postMessage({
                'signal': 'on-ready',
                'params': 'continue',
            }, '*');                        // to main_renderer.js
        }
    }

};