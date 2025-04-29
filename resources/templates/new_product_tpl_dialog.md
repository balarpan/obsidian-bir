<%*
function sanitizeName(t) { return t.replaceAll(" ","_").replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}
function sanitizeLite(t) { return t.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_').replace(/_+/g, '_');}

const pName = (await tp.system.prompt("Наименование продукта")).trim();
if ( !pName.length ) { return; }

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
	cSelected = ( sel ? sel : cSelected );
}
const country = cSelected.country;

const pFolderRoot = "/Products/" + (cSelected.name ? sanitizeLite(cSelected.name) + '/' : '');
//const pFolder = pFolderRoot + sanitizeLite(pName) + "/";
const pFolder = pFolderRoot;
if (!tp.file.exists(pFolderRoot)) {
	await this.app.vault.createFolder(pFolderRoot);
}
if (!tp.file.exists(pFolder)) {
	await this.app.vault.createFolder(pFolder);
}

const tagsPrep = cSelected.name ? cSelected.name + '/' + sanitizeName(pName) : sanitizeName(pName);
const tagsString =  "Product/" +  tagsPrep;
const titleName = sanitizeLite(pName) + (cSelected.filename ? ' ' + sanitizeLite(cSelected.name) : '');
if ( await tp.file.exists(pFolder + titleName + ".md") ) {
	tp.system.prompt("Заметка " + pFolder + titleName +
	 " уже существует! Переименуйте её либо задайте другое название. Нажмите <Enter> для выхода.");
	new Notice(`Заметка ${titleName} уже существует!`, 2000);
	return;
}
await tp.file.rename(titleName);
await tp.file.move(pFolder + titleName);
new Notice(`Новая запись: ${pName}`, 3000);
-%>
---
aliases: "<% pName %>"
tags: <% tagsString %>
productName: "<% pName %>"
created_on: <% tp.date.now("YYYY-MM-DD") %>
<% (country ? 'country: "' + country + '"': 'country:') %>
<% (cSelected.name ? 'owner: "' + cSelected.name + '"' : 'owner:') %>
record_type: productNote
---

# Продукт <% pName %>

## Владелец продукта
<% (cSelected.name ? '[[' + cSelected.filename + '|' + cSelected.name + ']]' : '') %>

## Краткое описание
### Общие сведения
### Компоненты
### Сфера применения
### Известные пользователи

## Упоминание продукта в заметках:
```dataview
TABLE WITHOUT ID level1, level2, level3
FLATTEN flat(list("none", file.inlinks)) as level1
FLATTEN flat(list("none", level1.file.inlinks)) as level2 
FLATTEN flat(list("none", level2.file.inlinks)) as level3 SORT [level1, level2, level3]
WHERE file.folder = this.file.folder AND file = this.file and !contains(level1.tags, "Product/<% sanitizeName(cSelected.name) %>") and level1!=level3
```

---
## 📝Log

### <% tp.date.now("YYYY-MM-DD") %> - Начальная запись

notes_go_here
