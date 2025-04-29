import { AbstractRecordNote } from './AbstractRecordNote.ts';

export class Person extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_person_tpl_dialog.md";
}

export class Product extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_product_tpl_dialog.md";
}

export class Project extends AbstractRecordNote {
	readonly tempalteDialogFName = "new_project_tpl_dialog.md";
}