<%*
function sanitizeName(t) { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}
function sanitizeLite(t) { return t.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}

const pName = (await tp.system.prompt("Наименование проекта")).trim();
if ( !pName.length ) { return; }
//const countryList = tp.user.countryList();
const countryList = ["Россия", "Белоруссия", "Казахстан", "Узбекистан", "ОАЭ", "США"];
const country = await tp.system.suggester(countryList, countryList, false, 'Страна (опционально) или нажмите <Esc>');

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
	var selName = frm.companyName;
	if (frm.country && frm.country.trim().length) {
		selName = frm.companyName + '   (' + frm.country + ')'
	}
	companiesData.push({
		filePath: file.path,
		filename: file.basename,
		fileext: file.extension,
		name: frm.companyName,
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
		companiesData, false, 'Выберите Компанию или нажмите <Esc>'
		);
	cSelected = ( sel ? sel : cSelected )
}

const pFolderRoot = "/Projects/" + tp.date.now("YYYY") + "/"
const pFolder = pFolderRoot + sanitizeLite(pName) + "/"
if (!tp.file.exists(pFolderRoot)) {
	await this.app.vault.createFolder(pFolderRoot)
}
if (!tp.file.exists(pFolder)) {
	await this.app.vault.createFolder(pFolder)
	await this.app.vault.createFolder(pFolder + "docs/")
	await this.app.vault.createFolder(pFolder + "routine/")
}

const titleName = "Проект " + sanitizeLite(pName) + (cSelected.filename ? ' ' + sanitizeLite(cSelected.name) : '');
if ( await tp.file.exists(pFolder + titleName + ".md") ) {
	tp.system.prompt("Заметка " + pFolder + titleName +
	 " уже существует! Переименуйте её либо задайте другое название. Нажмите <Enter> для выхода.");
	new Notice(`Заметка ${titleName} уже существует!`, 3500);
	return;
}
await tp.file.rename(titleName);
await tp.file.move(pFolder + titleName);
new Notice(`Новая запись: ${pName}`, 3000);
-%>
---
aliases:
tags:
projectName: "<% pName %>"
created_on: <% tp.date.now("YYYY-MM-DD") %>
<% (country ? 'country: "' + country + '"': 'country:') %>
<% (cSelected.name ? 'projectOwner: "' + cSelected.name + '"': 'projectOwner:') %>
done: false
record_type: projectNote
---

# Проект <% pName %>
статус:: 
## Сведения
### Краткое описание
### Сроки
начало:: 
deadline::
окончание:: 

### Владельцы проекта
- <% (cSelected.name ? '[[' + cSelected.filename + '|' + cSelected.name + ']]': '') %>
### Участники

### Используемые продукты и решения

## Milestones
- [ ]  
- [ ]  

## Задачи и метрики
-  
-  

## Ресурсы и идеи
-  
-  
  
---
## 📝Log

### <% tp.date.now("YYYY-MM-DD") %> - Начальная запись

notes_go_here

---
## Упоминания в других заметках:
```dataview
list from [[#this.file.name]] and !outgoing([[# this.file.name]])
```