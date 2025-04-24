import {App, ButtonComponent, PluginSettingTab, SearchComponent, Setting, TextComponent} from "obsidian"

interface BirSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: BirSettings = {
	companiesFolder: '/Companies',
	personsFolder: '/Persons',
	openAfterCreation: true,
	useCredentials: false,
	authUser: '',
	authPass: '',
	ribbonButton: false
}

export class BirSettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	app: App;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
	}

	isTemplaterEnabled(): bool {return this.app?.plugins?.enabledPlugins?.has("templater-obsidian");}
	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Показывать кнопку')
			.setDesc("Нужно ли отображать на панели инструментов кнопку запуска поиска компании. После изменения потребуется перезапуск.")
			.addToggle(component => component
				.setValue(this.plugin.settings.ribbonButton)
				.onChange(async value => {
						this.plugin.settings.ribbonButton = value
						await this.plugin.saveSettings()
					}
				)
			)
		new Setting(containerEl)
			.setName('Директория для компаний')
			.setDesc('Директория, в которой будут создаваться заметки о компании')
			.addText(text => text
				.setPlaceholder('укажите путь')
				.setValue(this.plugin.settings.companiesFolder)
				.onChange(async (value) => {
					this.plugin.settings.companiesFolder = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Директория для персон')
			.setDesc('Директория, в которой будут создаваться заметки о персонах')
			.addText(text => text
				.setPlaceholder('укажите путь')
				.setValue(this.plugin.settings.personsFolder)
				.onChange(async (value) => {
					this.plugin.settings.personsFolder = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Открывать после создания')
			.setDesc("Следует ли открыть новую созданную заметку при успешном завершении процесса.")
			.addToggle(component => component
				.setValue(this.plugin.settings.openAfterCreation)
				.onChange(async value => {
						this.plugin.settings.openAfterCreation = value
						await this.plugin.saveSettings()
					}
				)
			)
		new Setting(containerEl)
			.setName('Метод подключения')
			.addDropdown(dropdown => {
				dropdown
					.addOption('guest', 'Не использовать логин-пароль')
					.addOption('auth', 'Авторизоваться как пользователь')
					.setValue(this.plugin.settings.useCredentials ? 'auth' : 'guest')
					.onChange(async(value) => {
						this.plugin.settings.useCredentials = value == 'auth'
						await this.plugin.saveSettings()
						this.display() // force refresh
					})
				}
			)
		new Setting(containerEl)
			.setName('Учётная запись')
			.setDesc('Укажите лоигн и пароль учётной записи в БИР Аналитик')
			.addText(text => text
				.setPlaceholder('укажите логин')
				.setValue(this.plugin.settings.authUser)
				.onChange(async (value) => {
					this.plugin.settings.authUser = value;
					await this.plugin.saveSettings();
				}))
			.addText(text => text
				.setPlaceholder('укажите пароль')
				.setValue(this.plugin.settings.authPass)
				.onChange(async (value) => {
					this.plugin.settings.authPass = value;
					await this.plugin.saveSettings();
				}));

		}
}
