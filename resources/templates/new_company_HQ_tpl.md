---
aliases: '<% pname %>'
tags: <% tagsString %> Company_HQ
created_on:  <% tp.date.now("YYYY-MM-DD") %>
<% (country ? 'country: "' + country + '"': 'country:') %>
companyName: '<% shortName %>'
<% taxID ? 'taxID: "' + taxID + '"' : 'taxID' %>
Industry:
parentCompany:
record_type: <% recordType ? recordType : 'company_HQ' %>
---

# <% shortName %>

Официальный сайт: 

## Краткое описание
<% fullNameTitle %>
<% companyAddress %>
<% companyStatus.startsWith("Действующая") ?  companyStatus : '=='+companyStatus+'=='  %>

## Центральный аппарат

## 📇Подчинённые компании
```dataviewjs
dv.table(["Компания", "страна"], dv.pages('"Companies"').where(p => dv.func.contains(p.parentCompany,dv.current().file.link))
.sort(p => p.CompanyFullName).map(p => { return [ dv.func.link(p.file.link,p.CompanyFullName), p.country] } )
)
```

## 💼Офисы и сотрудники

### Региональные офисы
```dataview
TABLE office_country as "Страна"
from #<% tagsString %> 
where record_type="companyOffice"
```

### 👨‍💼Сотрудники 

```dataview
TABLE WITHOUT ID link(file.name,ФИО) as "ФИО", country_residence as "Страна", Город, Должность, link(Фото,"50") as "Фото", dateformat(row.file.mtime, "yyyy-MM-dd") as "Обновлено"
from #Person/<% tagsString %> 
where record_type="personNote"
sort Страна, ФИО
```


## Продукты, сервисы и проекты
### Продукты и сервисы
```dataview
LIST WITHOUT ID link(file.name, productName) FROM "Products"
WHERE owner="<% shortName.replaceAll('"','\\\"') %>" and record_type="productNote"
```
### Проекты
```dataview
TABLE WITHOUT ID link(file.name, projectName) as Проект, статус, начало, окончание FROM "Projects"
WHERE record_type="projectNote" and projectOwner="<% shortName.replaceAll('"','\\\"') %>"
```

## Ключевые клиенты

## Упоминания в других заметках:
```dataview
TABLE WITHOUT ID level1, level2, level3
FLATTEN flat(list("none", file.inlinks)) as level1
FLATTEN flat(list("none", level1.file.inlinks)) as level2 
FLATTEN flat(list("none", level2.file.inlinks)) as level3 SORT [level1, level2, level3]
WHERE file.folder = this.file.folder AND file = this.file and !contains(level1.tags, "Product/<% pnameCln %>") and level1!=level3
LIMIT 50
```

---
## 📝Log

### <% tp.date.now("YYYY-MM-DD") %> - Начальная запись
notes_go_here