const Applet = imports.ui.applet;
const Popup = imports.ui.popupMenu;
const Util = imports.misc.util;
const File = imports.misc.fileDialog;

const UUID_LENGTH = 32 + 4; // 32 letters and 4 dashes.

function MyApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

MyApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(metadata, orientation, panel_height, instance_id) {
        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

        this.menuManager = new Popup.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this.connection_type = "wireguard";
        this.connections = [];

        this.connected_icon = metadata.path + "/connected.svg";
        this.disconnected_icon = metadata.path + "/disconnected.svg";

        this.set_applet_icon_path(this.disconnected_icon);
        this.set_applet_tooltip('Not connected!');
        this.make_menu();

        this.update_loop = setInterval(() => this.update_connections(), 1000);
    },

    make_menu: function() {
        let importBtn = new Popup.PopupMenuItem(_("Import config"));
        importBtn.connect('activate', this.import_config.bind());
        this.menu.addMenuItem(importBtn);
    },

	on_applet_clicked: function(event) {
        this.menu.toggle();
	},

    update_connections: function() {
        this.get_connections((new_connections) => {
            this.connections = new_connections;
            let menu_items = this.menu._getMenuItems();

            menu_items.forEach((item, index, menu_array) => {
                if (!this.connection_exists(item.connection_uuid)) {
                    if (item.connection_uuid !== undefined) {
                        menu_array[index].destroy();
                    }
                }
            });

            this.connections.forEach((connection) => {
                let connection_item = this.menu_item_exists(connection['uuid']);
                if (connection_item === false) {
                    let connectionBtn = new Popup.PopupSwitchMenuItem(connection['name']);
                    connectionBtn.connect('toggled', this.on_connection_toggle.bind(this, connectionBtn));
                    connectionBtn.connection_uuid = connection['uuid'];
                    connectionBtn.connection_name = connection['name'];

                    this.menu.addMenuItem(connectionBtn, this.menu._getMenuItems().length - 1); // Place before last element.
                } else {
                    Util.spawnCommandLineAsyncIO(`nmcli connection show ${connection['uuid']}`, (connection_info) => {
                        let found_state_line = false;
                        connection_info.split('\n').forEach((connection_info_line) => {
                            if (connection_info_line.startsWith("GENERAL.STATE:")) {
                                found_state_line = true;
                                if (connection_info_line.endsWith("activated")) {
                                    connection_item.setToggleState(true);
                                    this.set_applet_tooltip(`Connected to ${connection['name']}!`);
                                    this.set_applet_icon_path(this.connected_icon);
                                }
                            }
                        });

                        if (!found_state_line && connection_item.state) {
                            connection_item.setToggleState(false);
                            this.set_applet_tooltip(`Not connected!`);
                            this.set_applet_icon_path(this.disconnected_icon);
                        }
                    });
                }
            });
        });
    },

    connection_exists: function (uuid) {
        for (let i = 0; i < this.connections.length; i++) {
            if (this.connections[i]['uuid'] == uuid) {
                return true;
            }
        }

        return false;
    },

    menu_item_exists: function (uuid) {
        let items = this.menu._getMenuItems();
        for (let i = 0; i < items.length; i++) {
            if (items[i].connection_uuid !== undefined && items[i].connection_uuid == uuid) {
                return items[i];
            }
        }

        return false;
    },

    /**
     * get_connections:
     * @callback (function): called after retreival of connections
     *
     * Calls `nmcli` to list all connections, then searches each line
     * for regex match containing UUID and matching interface type.
     * Example: Valid:   `deb63752-d5e7-4b93-a03d-9ec9f5fa7b73 wireguard`
     *          Invalid: `deb63752-d5e7-4b93-a03d-9ec9f5fa7b73 ethernet`
     *
     * If match is found, parse the line and push it to connections array.
     * After function processed all lines, call callback with connections
     * array as argument.
     *
     * Returns: nothing.
     */
    get_connections: function(callback) {
        Util.spawnCommandLineAsyncIO('nmcli connection show', (stdout) => {
            let stdout_line = stdout.split("\n");
            let uuid_pattern = new RegExp(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[ ]{1,}${this.connection_type}`, "g");
            let connections = [];

            stdout_line.forEach((line) => {
                let match = line.match(uuid_pattern);

                if (match !== null) {
                    let connection = {
                        name: line.slice(0, line.indexOf(' ')),
                        uuid: match[0].slice(0, UUID_LENGTH),
                    };
                    connections.push(connection);
                }
            });

            callback(connections);
        });
    },

    on_connection_toggle: function(btn) {
        let label, icon;

        if (btn._switch.state === true) {
            Util.spawnCommandLine(`nmcli connection up ${btn.connection_uuid}`);
            label = `Connected to ${btn.connection_name}!`;
            icon = this.connected_icon;

        } else {
            Util.spawnCommandLine(`nmcli connection down ${btn.connection_uuid}`);
            label = "Not connected!";
            icon = this.disconnected_icon;
        }

        this.set_applet_tooltip(label);
        this.set_applet_icon_path(icon);
    },

    import_config: function() {
        let params = {
            selectMultiple: false,
            path: "~",
            name: undefined,
            directory: undefined,
            filters: undefined
        };

        File.open((file) => {
            Util.spawnCommandLine(`nmcli connection import type wireguard file ${file}`);
        }, params);
    },
};

function main(metadata, orientation, panel_height, instance_id) {
    return new MyApplet(metadata, orientation, panel_height, instance_id);
}
