import {App, ButtonComponent, PluginSettingTab, SearchComponent, Setting, TextComponent} from "obsidian"

interface BirSettings {
	companiesFolder: string;
	personsFolder: string,
	productsFolder: string,
	projectsFolder: string,
	openAfterCreation: boolean,
	openAfterCreationNewTab: boolean,
	extServiceName: string,
	useCredentials: boolean,
	authUser: string,
	authPass: string,
	ribbonButton: boolean,
	formOfPropertyRegexp: void,
	formOfPropertyRegexpStr: string

}

export const DEFAULT_SETTINGS: BirSettings = {
	companiesFolder: '/Companies',
	personsFolder: '/Persons',
	productsFolder: '/Products',
	projectsFolder: '/Projects',
	openAfterCreation: true,
	openAfterCreationNewTab: false,
	extServiceName: 'БИР Аналитик',
	useCredentials: false,
	authUser: '',
	authPass: '',
	ribbonButton: false,
	formOfPropertyRegexp: null,
	formOfPropertyRegexpStr: '^(АО|ООО|ЗАО|ПАО|ФГУП)\\s+(.+)$'
}

export class BirSettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	app: App;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
	}

	isTemplaterEnabled(): boolean {return this.app?.plugins?.enabledPlugins?.has("templater-obsidian");}
	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		if (!this.isTemplaterEnabled()){
			const s = new Setting(containerEl)
			.setName("Не найден плагин Templater!!!")
			.setDesc("Для работы приложения необходим уставноленный плагин. Убедитесь, что Templater активирован. При необходимости установите Templater стандартными средствами Obsidian");

			const a = document.createElement("a");
			a.setAttribute("href", "https://github.com/SilentVoid13/Templater/");
			a.textContent = "https://github.com/SilentVoid13/Templater/";
			s.settingEl.appendChild(a);

			return;
		}

		new Setting(containerEl)
			.setName('Кнопка на панели инструментов')
			.setDesc("Нужно ли отображать на панели инструментов кнопку запуска поиска компании. После изменения потребуется перезапуск.")
			.addToggle(component => component
				.setValue(this.plugin.settings.ribbonButton)
				.onChange(async value => {
						this.plugin.settings.ribbonButton = value
						await this.plugin.saveSettings()
					}
				)
			)
		function FolderSettingsDisplay(name,desc, varSet) {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.setTooltip('Все поля в заметке, а также теги и другие значения будут ссылаться на этот путь. \nНе рекомендуется менять значение при уже созданных плагином заметках.')
				.addText(text => text
					.setPlaceholder('укажите путь')
					.setValue(varSet)
					.onChange(async (value) => {
						varSet = value;
						await this.plugin.saveSettings();
					}));
		}
		const foldersPath = [
			['Каталог для заметок о компаниях', 'Каталог, в котором будут создаваться заметки о компании', this.plugin.settings.companiesFolder],
			['Каталог для заметок о персонах', 'Каталог, в котором будут создаваться заметки о персонах', this.plugin.settings.personsFolder],
			['Каталог для заметок о продуктах компании', 'Каталог, в котором будут создаваться заметки о продуктах', this.plugin.settings.productsFolder],
			['Каталог для заметок о проектах', 'Каталог, в котором будут создаваться заметки о проектах', this.plugin.settings.projectsFolder],
		];
		foldersPath.forEach( (item) => {
			FolderSettingsDisplay(...item);
		})
		new Setting(containerEl)
			.setName('Открывать после создания')
			.setDesc("Следует ли открыть новую созданную заметку при успешном завершении процесса.")
			.addToggle(component => component
				.setValue(this.plugin.settings.openAfterCreation)
				.onChange(async value => {
						this.plugin.settings.openAfterCreation = value
						await this.plugin.saveSettings();
						this.display();
					}
				)
			)
		if (this.plugin.settings.openAfterCreation) {
			new Setting(containerEl)
				.setName('Открывать в новой вкладке')
				.setDesc("Открыть созданную заметку в новой вкладке или в активной.")
				.addToggle(component => component
					.setValue(this.plugin.settings.openAfterCreationNewTab)
					.onChange(async value => {
							this.plugin.settings.openAfterCreationNewTab = value
							await this.plugin.saveSettings();
						}
					)
				)
		}
		new Setting(containerEl)
			.setName('Метод подключения')
			.addDropdown(dropdown => {
				dropdown
					.addOption('guest', 'Не использовать логин-пароль')
					.addOption('auth', 'Авторизоваться как пользователь')
					.setValue(this.plugin.settings.useCredentials ? 'auth' : 'guest')
					.onChange(async value => {
							this.plugin.settings.useCredentials = (value == 'auth');
							await this.plugin.saveSettings();
							this.display(); // force refresh
						})
				}
			)
		if (this.plugin.settings.useCredentials) {
			new Setting(containerEl)
				.setName('Сервис проверки контрагентов')
				.addDropdown(dropdown => {
					dropdown
						.addOption('BIR', 'БИР Аналитик')
						.setValue('BIR')
						.onChange(async(value) => {
							this.plugin.settings.extServiceName = value;
							await this.plugin.saveSettings();
							this.display(); // force refresh
						})
					}
				)
			new Setting(containerEl)
				.setDisabled(this.plugin.settings.useCredentials)
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
}
