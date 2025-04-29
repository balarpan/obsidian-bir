<%*
function sanitizeName(t) { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}
function sanitizeLite(t) { return t.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}

const countryList = ["Россия", "Белоруссия", "Казахстан", "Узбекистан", "ОАЭ", "США"];
//const countryList = tp.user.countryList();
let country = await tp.system.suggester(countryList, countryList, false, 'Страна (опционально) или нажмите <Esc>');

//enumerate Companies and check that we hava file in the path not a folder with ".md" in the name
const cFiles = this.app.vault.getAllLoadedFiles().filter(i => 'path' in i && 
 	i.path.startsWith("Companies/") && 
 	i.path.endsWith("_HQ.md") && 
 	this.app.vault.getAbstractFileByPath(i.path) instanceof tp.obsidian.TFile
 );

var companiesData = new Array();
cFiles.forEach((file) => {
  const noteTFile = tp.file.find_tfile(file.basename);
  var frm = this.app.metadataCache.getFileCache(noteTFile)?.frontmatter || {};
  if ( 'company_HQ' == frm.record_type ) {
	var selName = frm.CompanyFullName;
	if (frm.country && frm.country.trim().length) {
		selName = frm.CompanyFullName + '   (' + frm.country + ')'
	}
	companiesData.push({
		filePath: file.path,
		filename: file.basename,
		fileext: file.extension,
		name: frm.CompanyFullName,
		tags: frm.tags,
		country: frm.country,
		selName: selName
	});
  }
	
});
companiesData = companiesData.sort( (a, b) => a.selName.toLowerCase().localeCompare(b.selName.toLowerCase()) )

let cSelected = {name:null, country:null, filename:null}
if ( companiesData.length ) {
	let sel = await tp.system.suggester(
		companiesData.map(i => i.selName),
		companiesData, false, 'Выберите Компанию (опционально) или нажмите <Esc>'
		);
	cSelected = ( sel ? sel : cSelected )
}
const ename = (await tp.system.prompt("Имя, Отчество и Фамилия")).trim();
//const enamesafe = sanitizeName(ename);
const titleName = "@" + sanitizeLite(ename) + (cSelected.filename ? ' ' + sanitizeLite(cSelected.name) : '');
if ( await tp.file.exists("/Persons/" + titleName + ".md") ) {
	tp.system.prompt("Заметка /Persons/" + titleName +
	 " уже существует! Переименуйте её либо задайте другое ФИО. Нажмите <Enter> для выхода.");
	new Notice(`Заметка ${titleName} уже существует!`, 2000);
	return;
}
await tp.file.rename(titleName);
await tp.file.move("/Persons/" + titleName);
var tagStr = null
if ( cSelected.filename ) {
	tagStr = 'Company/' + (cSelected.country ? cSelected.country+'/' : '') + sanitizeName(cSelected.name)
}
new Notice(`Новая запись: ${ename}`, 3000);

-%>
---
<% (ename.trim().indexOf(' ') >=0 ? 'aliases: "' + ename + '"' : 'aliases:') %>
<% (tagStr ? 'tags: ' + tagStr : 'tags:')  %>
created_on: <% tp.date.now("YYYY-MM-DD") %>
<% (country ? 'country_residence: "' + country + '"': 'country_residence:') %>
<% (cSelected.name ? 'company: "' + cSelected.name + '"': 'company:') %>
office:
office_country:
record_type: personNote
---
# Персона <% ename %>

## Контактные данные
ФИО:: <% ename %>
телефон:: 
email:: 
Фото:: 
ДР:: 

### Родственные связи

## Биография

## Расположение
Страна:: <% country %>
Город:: 
Компания:: <% (cSelected.name ? '[['+cSelected.filename+'|'+cSelected.name+']]' : null) %>
Должность:: 
Начальник:: 

## Опыт работы
### Места работы и навыки
### Упоминания, связи

## Проекты

---
## 📝Log

### <% tp.date.now("YYYY-MM-DD") %> - Начальная запись

notes_go_here
