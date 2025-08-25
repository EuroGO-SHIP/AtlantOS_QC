// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const path = require('path');
const app_module_path = require('app-module-path');

const bokeh_calls = require('./bokeh_calls');
const popper = require('popper.js');
const { clipboard } = require('electron');

const tail_file = require('@logdna/tail-file')
const split2 = require('split2') // A common and efficient line splitter
const fs = require('fs');

const lg = require('logging');
const loc = require('locations');


module.exports = {

    /* DEPRECATED: use show_modal instead */
    showModal: function (type, msg='', title='', callback=false, code=''){
        // Show a modal window with a simple message. Arguments:
        //      * type: posible values 'ERROR', 'WARNING', 'INFO', 'other title'
        //      * msg: message to show in the modal form
        //      * [title]: customized title
        //      * [callback]: callback function to run after the dialog is closed

        var self = this;
        var url = path.join(loc.modals, 'modal_message.html');
        self.load_modal(url, function() {
            var modal = $('#modal_message');
            switch (type) {
                case 'ERROR':
                    modal.find('.modal-title').css('color', '#a94442');   // TODO: assign a class and set the color in the class
                    modal.find('.modal-title-icon').removeClass().addClass('fa fa-exclamation-triangle');
                    break;
                case 'INFO':
                    modal.find('.modal-title').css('color', '#5FBA7D');
                    modal.find('.modal-title-icon').removeClass().addClass('fa fa-info-circle');
                    break;
                case 'WARNING':
                    modal.find('.modal-title').css('color', '#fd7e14');
                    modal.find('.modal-title-icon').removeClass().addClass('fa fa-exclamation-triangle');
                    break;
                }


            if (title != '') {
                modal.find('.modal-title-text').text(title);
            } else {
                modal.find('.modal-title-text').text(type);
            }

            if (msg != '') {
                modal.find('.modal-body').append(
                    $('<p>', { text : msg })
                );
                if (type == 'ERROR') lg.error(msg);
            }
            if (code != '') {
                modal.find('.modal-dialog').addClass('modal-lg');
                modal.find('.modal-body').append(
                    $('<pre>', { text : code })
                );
            }

            if (callback !== false) {
                $('#modal_message_close').click(callback);
            }
            self.show_default_cursor();
            $('#modal_message_trigger').click();
        });
    },

    show_modal: function (params={}){
        // Show a modal window with a simple message. Arguments:
        //      * type: posible values 'ERROR', 'WARNING', 'INFO', 'other title'
        //      * msg: message to show in the modal form
        //      * [title]: customized title
        //      * [callback]: callback function to run after the dialog is closed
        var self = this;

        var type = '';
        if ('type' in params) {
            type = params['type'];
        }
        var msg = '';
        if ('msg' in params) {
            msg = params['msg'];
        }
        var title = '';
        if ('title' in params) {
            title = params['title'];
        }
        var callback = false;
        if ('callback' in params) {
           callback = params['callback'];
        }
        var code = '';
        if ('code' in params) {
            code = params['code'];
        }
        var msg_type = ''
        if ('msg_type' in params) {
            msg_type = params['msg_type'];
        }

        var url = path.join(loc.modals, 'modal_message.html');
        self.load_modal(url, function() {
            var modal = $('#modal_message');
            var t = type.toUpperCase();
            var errors = ['ERROR', 'UNCAUGHT EXCEPTION', 'VALIDATION ERROR', 'USER ERROR'];
            if (errors.includes(t)) {
                modal.find('.modal-title').css('color', '#a94442');   // TODO: assign a class and set the color in the class
                modal.find('.modal-title-icon').removeClass().addClass('fa fa-exclamation-triangle');
            } else if (t == 'INFO') {
                modal.find('.modal-title').css('color', '#5FBA7D');
                modal.find('.modal-title-icon').removeClass().addClass('fa fa-info-circle');
            } else if (t == 'WARNING') {
                modal.find('.modal-title').css('color', '#fd7e14');
                modal.find('.modal-title-icon').removeClass().addClass('fa fa-exclamation-triangle');
            }

            if (title != '') {
                modal.find('.modal-title-text').text(title);
            } else {
                type = type.replace(/\w\S*/g,
                    function(txt) {
                        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
                    }
                );
                modal.find('.modal-title-text').text(type);
            }

            if (msg_type == 'html') {
                if (msg != '') {
                    modal.find('.modal-body').html(msg)
                }
            } else {
                if (msg != '') {
                    modal.find('.modal-body').append(
                        $('<p>', { text : msg })
                    );
                }
            }
            if (code != '') {
                modal.find('.modal-dialog').addClass('modal-lg');
                modal.find('.modal-body').append(
                    $('<pre>', { text : code })
                );
                modal.find('.modal-footer').prepend($('<button>', {
                    id: 'cp_code_to_clipboard',
                    type: 'button',
                    class: 'btn btn-primary',
                    text: 'Copy to clipboard'
                }));
                $('#cp_code_to_clipboard').on('click', function() {
                    clipboard.writeText($('.modal-body pre').text());
                    self.show_snackbar(
                        'Error text copied in the clipboard. ' +
                        'You can now paste it anywhere with Ctrl+V'
                    );
                });

            }

            if (callback !== false) {
                $('#modal_message_close').click(callback);
            }
            self.show_default_cursor();
            $('#modal_message_trigger').click();
        });
    },

    call_promise: function(params={}) {
        /* The params argument should be something like this
                params = {
                        'object': 'data',
                        'method': 'method_name',
                        'args': {}
                }

                OK    > returns the requested information or a modal message with the error
                      > I suggest to return "false" for manual error
                ERROR > returns null and a modal message is shown
        */
        self = this;
        return new Promise((resolve, reject) => {
            var message = {
                'object': params.object,
                'method': params.method,
                'args': params.args,
            }
            document.getElementById('bokeh_iframe').contentWindow.postMessage({
                "signal": "call-python-promise",
                "message_data": message
            } , '*');  // to index.html, the click on the button is run there as well

            var wait_python_response = setInterval(() => {
                if (typeof($('body').data('python_response')) !== 'undefined') {
                    lg.info('~~ CLEAR INTERVAL RESPONSE PYTHON')
                    clearInterval(wait_python_response);
                    resolve($('body').data('python_response'));
                    $('body').removeData('python_response');
                }
                if (typeof($('body').data('python_error')) !== 'undefined') {
                    lg.info('~~ CLEAR INTERVAL WITH ERROR')
                    clearInterval(wait_python_response);
                    resolve(null);
                    self.showModal('ERROR','', 'Uncaught Exception', false, $('body').data('python_error'))
                    $('body').removeData('python_error');
                }
            }, 10);
        });
    },

    multi_modal_fix: function(on_close_callback=false) {
        // This has to be run in the parent modal windows and in the children as well
        // TODO: Look for a better fix, because the fade animation is not working well

        $(document).on('show.bs.modal', '.modal', function () {
            var zIndex = 1040 + (10 * $('.modal:visible').length);
            $(this).css('z-index', zIndex);
            setTimeout(function() {
                $('.modal-backdrop').not('.modal-stack').css('z-index', zIndex - 1).addClass('modal-stack');
            }, 0);
        });

        $(document).on('hidden.bs.modal', '.modal', function () {
            $('.modal:visible').length && $(document.body).addClass('modal-open');
            $(this).prev().remove();
            $(this).remove();
        });

    },

    load_modal: (url, callback=false) => {
        // I have read this on SO, but I do not know what are the "intermediate steps":
        // >> So for the purpose of getting partial HTML content from the server & inserting it into the DOM,
        // >> load is a better method than the get method, as the developer does not need to worry about
        // >> handling huge data & various intermediate steps that the load function does before
        // >> fetching & before inserting the content.
        // https://stackoverflow.com/questions/1246137/ajax-jquery-load-versus-jquery-get

        $.get(url, function(data) {
            $(data).prependTo('body');
            $('[data-toggle="tooltip"]').tooltip();  // this affects just the elements defined in the form
                                                     // you will need to run this again if you add elements by JS
            if (callback !== false) {
                callback();
            }
        });
    },

    modal_question: function(args) {
        // Show a modal form with a question (Thge possible answer is "Yes" or "No")
        // args = {
        //     'msg': 'modal message',
        //     'title': 'modal title',
        //     'calback_yes': callback_yes,
        //     'calback_no': callback_no,
        //     'calback_close': callback_close,
        //     'self': self,                    // this should be used only if the callback function need it to work
        // }

        var self = this;
        var url = path.join(loc.modals, 'modal_question.html');
        self.load_modal(url, function() {
            if (typeof(args.msg) === 'undefined') {
                args['msg'] = '';
            }
            if (typeof(args.title) === 'undefined') {
                args['title'] = '';
            }
            if (typeof(args.callback_yes) === 'undefined') {
                args['callback_yes'] = false; // do nothing
            }
            if (typeof(args.callback_no) === 'undefined') {
                args['callback_no'] = false;
            }

            $('#modal_question_content').html(args.msg);
            $('#modal_question .modal-title-text').text(args.title);

            $('#modal_yes').on('click', function() {
                if (args.callback_yes !== false && typeof(args.callback_yes) === 'function') {
                    if ('self' in args) {
                        args.callback_yes(args.self);
                    } else {
                        args.callback_yes();    // this is better, more isolated
                    }
                }
            });

            $('#modal_no').on('click', function() {
                if (args.callback_no !== false && typeof(args.callback_no) === 'function') {
                    args.callback_no();
                }
            });

            if (args.callback_close !== false && typeof(args.callback_close) === 'function') {
                $('#modal_question .close').on('click', function() {
                    args.callback_close();
                });
            }

            $('#modal_trigger_modal_question_form').click();
        });
    },

    show_snackbar: function(msg='') {
        lg.info('-- SHOW SNACKBAR');
        var x = document.getElementById("snackbar");
        x.innerHTML = msg;
        x.className = "show";
        setTimeout(function(){ x.className = x.className.replace("show", ""); }, 6000);
    },

    js_call: function(args={}) {
        /*  This function is executed when a JavaScript function should be called from Python
            Call structure:
                args = {
                    'object': 'object.name',
                    'function': 'method_name',
                    'params': ['arg1', 'arg2']
                }

            Note: I could use bind as an alternative here
            https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind
        */
        var self = this;
        var o = null;
        if ('object' in args) {
            if (args.object == 'tools') {
                o = self;
            } else if (args.object == 'bokeh.calls') {
                o = bokeh_calls;
            }
        }
        if ('function' in args) {
            if ('params' in args) {
                o[args['function']].apply(o, args['params']);
            } else {
                o[args['function']].apply(o);
            }
        }
    },

    show_wait_cursor:  function() {
        // TODO: set a with maximum time (to avoid asyncronous issues)
        lg.info('>> SET CURSOR STYLE TO WAIT');
        if ($('#loader_mask').css('display') == 'none') {
            $('#loader_mask').css('display', 'block');
        }
    },

    show_default_cursor:  function() {
        lg.info('>> SET CURSOR STYLE TO DEFAULT');
        if ($('#loader_mask').css('display') == 'block') {
            $('#loader_mask').css('display', 'none');
        }
    },

    show_loader: function() {
        $('.welcome_container').fadeOut('slow', function() {
            $('.loader_container').fadeIn('slow');

            return;
            // TODO: create a cleaner log. This was not working in Mac

            const tail = new tail_file(loc.log_python, {encoding: 'utf8'})
            tail.on('tail_error', (err) => {
                console.error('tail_file had an error!', err);
                throw err;
            }).start().catch((err) => {
                console.error('Cannot start. Does the file exist?', err);
                throw err;
            })

            tail.pipe(split2()).on('data', (line) => {
                var p = $('<p>', {
                    text: line.slice(1, -1)   // to remove the quotes
                })
                $('#log_python').prepend(p);
            })
        });
    },

    hide_loader: function() {
        $('.loader_container').fadeOut('slow', function() {
            $('#bokeh_iframe').fadeIn('slow');
            $('#log_python').html('');
        });
    },

    /** Convert a url "file:///C/..." to the path syntax "C:/..." */
    file_to_path: function(file_url=false) {
        // TODO: check if some modification is necessary on linux and mac
        if (file_url.startsWith('file:')) {
            var p = new URL(file_url).pathname;
            if (process.platform === 'win32') {
                if (p.charAt(0) === '/') {
                    p = p.substr(1);
                }
                p = path.join(p, '');
            }
            if (p.includes('%20')) {
                p = p.replace(/%20/g, ' ');
            }
            return p;
        } else {
            return file_url;
        }
    },

    close_embed_forms: function() {
        // close df_data form if it is open
        if ($('#close_df_data').length > 0) {
            $('#close_df_data').click();
        }
    },

    load_popover: function() {
        var timer;
        $('.pop').popover({
            trigger: 'manual',
            html: true,
            animation: true,
            // offset: 200
        })
        .on('mouseleave', function () {
            clearTimeout(timer);
            var _this = this;
            setTimeout(function () {
                if (!$('.popover:hover').length) {
                    $(_this).popover('hide');
                }
            }, 300);
        })
        .on('mouseenter', function () {
            var _this = this;
            timer = setTimeout(function () {
                $(_this).popover('show');
                $('.popover').on('mouseleave', function () {
                    $(_this).popover('hide');
                });
            }, 1500);
        })
        .on('click', function () {
            var _this = this;
            $(this).popover('show');
            $('.popover').on('mouseleave', function () {
                $(_this).popover('hide');
            });
        })
    },

    popover_fix: function() {
        // To prevent blurred text in tooltips: https://github.com/twbs/bootstrap/issues/22610
        popper.Defaults.modifiers.computeStyle.gpuAcceleration = !(window.devicePixelRatio < 1.5 && /Win/.test(navigator.platform));
    },

    set_tags_input: function(tr=false) {
        var options = {
            confirmKeys: [
                13,     // carriage return (enter, but it does not work)
                44,     // comma
                32,     // space
                59      // semicolon
            ],
            validationPattern: new RegExp('^[a-zA-Z_]+$'),  // this should used sanitized characters
            cancelConfirmKeysOnEmpty: false                 // is this working?
        };
        var filter = "input[data-role=tagsinput], select[multiple][data-role=tagsinput]";
        if (tr === false) {
            $(filter).tagsinput(options);
        } else {
            tr.find(filter).tagsinput(options);
        }
    },

    disable_tags_input: function() {
        $('.bootstrap-tagsinput .badge [data-role="remove"]').css('cursor', 'default');
        $('.bootstrap-tagsinput').css({
            'cursor': 'default',
            'background-color': '#e9ecef',
            'color': '#9E9999'
        })
        $('.bootstrap-tagsinput input, input[name="txt_external_name"]').attr('disabled', true);
    },

    enable_tags_input: function(tr=false) {
        tr.find('.bootstrap-tagsinput .badge [data-role="remove"]').css('cursor', 'pointer');
        tr.find('.bootstrap-tagsinput').css({
            'background-color': '',
            'color': ''
        })

        tr.find('.bootstrap-tagsinput input, input[name="txt_external_name"]').removeAttr('disabled');
    },

    /**
     * Compare two software version numbers (e.g. 1.7.1). Returns:
     *
     *  - 0 if they're identical
     *  - negative if v1 < v2
     *  - positive if v1 > v2
     *  - false if they in the wrong format
     *
     *  Taken from http://stackoverflow.com/a/6832721/11236
     */
    compare_versions: function(v1, v2){
        var v1parts = v1.split('.');
        var v2parts = v2.split('.');

        function validate_parts(parts) {
            for (var i = 0; i < parts.length; ++i) {
                if (!/^\d+$/.test(parts[i])) {  // check if positive integer
                    return false;
                }
            }
            return true;
        }
        if (!validate_parts(v1parts) || !validate_parts(v2parts)) {
            return false;
        }

        for (var i = 0; i < v1parts.length; ++i) {
            if (v2parts.length === i) {
                return 1;
            }

            if (v1parts[i] === v2parts[i]) {
                continue;
            }
            if (v1parts[i] > v2parts[i]) {
                return 1;
            }
            return -1;
        }

        if (v1parts.length != v2parts.length) {
            return -1;
        }

        return 0;
    },

    set_python_path: function(obj, caller) {
        lg.info('-- SET PYTHON PATH')
        if (process.platform === 'win32' && fs.existsSync(loc.python_win)) {
            obj.python_path = loc.python_win;
            obj.script_env_path = loc.env_bin_win;
        } else if (process.platform === 'darwin' && fs.existsSync(loc.python_mac)) {
            obj.python_path = loc.python_mac;
            obj.script_env_path = loc.env_bin_mac;
        } else if (process.platform === 'linux' && fs.existsSync(loc.python_lin)) {
            obj.python_path = loc.python_lin;
            obj.script_env_path = loc.env_bin_lin;
        } else {
            if (caller == 'server') {
                obj.show_python_path_dg_err();
            }
            return;
        }
        if (obj.python_path != '' && obj.script_env_path != '') {
            obj.check_python_version().then(() => {
                if (caller == 'server') {
                    obj.set_atlantos_qc_path();
                } else { // 'server_renderer'
                    obj.get_css_checksums()
                }
            }).catch((err) => {
                if (caller == 'server') {
                    obj.show_python_path_dg_err(err);
                }
            })
        } else {
            if (caller == 'server') {
                obj.show_python_path_dg_err()
            }
        }
    },
}
