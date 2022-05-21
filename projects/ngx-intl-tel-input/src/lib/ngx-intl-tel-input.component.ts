import * as lpn from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json'
import {
	ChangeDetectorRef,
	Component,
	ElementRef,
	EventEmitter,
	Input,
	OnChanges,
	OnInit,
	Optional,
	Output,
	Self,
	SimpleChanges,
	ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';

import { setTheme } from 'ngx-bootstrap/utils';

import { CountryCode } from './data/country-code';
import { CountryISO } from './enums/country-iso.enum';
import { SearchCountryField } from './enums/search-country-field.enum';
import type { ChangeData } from './interfaces/change-data';
import type { Country } from './model/country.model';
import { PhoneNumberFormat } from './enums/phone-number-format.enum';
import { take } from 'rxjs/operators';

@Component({
	// tslint:disable-next-line: component-selector
	selector: 'ngx-intl-tel-input',
	templateUrl: './ngx-intl-tel-input.component.html',
	styleUrls: ['./bootstrap-dropdown.css', './ngx-intl-tel-input.component.css'],
	providers: [
		CountryCode
	],
})
export class NgxIntlTelInputComponent implements OnInit, OnChanges, ControlValueAccessor {
	@Input() value: string | undefined = '';
	@Input() preferredCountries: Array<string> = [];
	@Input() enablePlaceholder = true;
	@Input() customPlaceholder: string;
	@Input() numberFormat: PhoneNumberFormat = PhoneNumberFormat.International;
	@Input() cssClass = 'form-control';
	@Input() onlyCountries: Array<string> = [];
	@Input() enableAutoCountrySelect = true;
	@Input() searchCountryFlag = false;
	@Input() searchCountryField: SearchCountryField[] = [SearchCountryField.All];
	@Input() searchCountryPlaceholder = 'Search Country';
	@Input() maxLength: number;
	@Input() selectFirstCountry = true;
	@Input() selectedCountryISO: CountryISO;
	@Input() inputId = 'phone';
	@Input() separateDialCode = false;
	@Input() markPristineOnExternalChange = false;
	separateDialCodeClass: string;

	@Output() readonly countryChange = new EventEmitter<Country>();

	fallbackPlaceholder = '1234 5678';

	selectedCountry: Country = {
		areaCodes: undefined,
		dialCode: '',
		htmlId: '',
		flagClass: '',
		iso2: '',
		name: '',
		placeHolder: '',
		priority: 0,
	};

	phoneNumber: string | undefined = '';
	allCountries: Array<Country> = [];
	preferredCountriesInDropDown: Array<Country> = [];

	disabled = false;
	errors: Array<any> = ['Phone number is required.'];
	countrySearchText = '';

	@ViewChild('countryList') countryList: ElementRef;

	onTouched = () => {};
	propagateChange = (_: ChangeData) => {};

	constructor(private countryCodeData: CountryCode,
		@Optional() @Self() public ngControl: NgControl,
		private cdr: ChangeDetectorRef) {
		// If this is not set, ngx-bootstrap will try to use the bs3 CSS (which is not what we've embedded) and will
		// Add the wrong classes and such
		setTheme('bs4');
		if (ngControl) {
			// NOTE: Because we need access to the form control itself, we have remove NG_VALUE_ACCESSOR from providers
			ngControl.valueAccessor = this;
		}
	}

	ngOnInit() {
		this.init();
	}

	ngOnChanges(changes: SimpleChanges) {
		const selectedISO = changes['selectedCountryISO'];
		if (
			this.allCountries &&
			selectedISO &&
			selectedISO.currentValue !== selectedISO.previousValue
		) {
			this.updateSelectedCountry();
		}
		if (changes['preferredCountries']) {
			this.updatePreferredCountries();
		}
		this.checkSeparateDialCodeStyle();
	}

	/*
		This is a wrapper method to avoid calling this.ngOnInit() in writeValue().
		Ref: http://codelyzer.com/rules/no-life-cycle-call/
	*/
	init() {
		this.fetchCountryData();
		if (this.preferredCountries.length) {
			this.updatePreferredCountries();
		}
		if (this.onlyCountries.length) {
			this.allCountries = this.allCountries.filter((c) =>
				this.onlyCountries.includes(c.iso2)
			);
		}
		if (this.selectFirstCountry) {
			if (this.preferredCountriesInDropDown.length) {
				this.setSelectedCountry(this.preferredCountriesInDropDown[0]);
			} else {
				this.setSelectedCountry(this.allCountries[0]);
			}
		}
		this.updateSelectedCountry();
		this.checkSeparateDialCodeStyle();
	}

	setSelectedCountry(country: Country) {
		this.selectedCountry = country;
		this.countryChange.emit(country);
	}

	/**
	 * Search country based on country name, iso2, dialCode or all of them.
	 */
	public searchCountry() {
		if (!this.countrySearchText) {
			this.countryList.nativeElement
				.querySelector('.iti__country-list li')
				.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'nearest',
				});
			return;
		}
		const countrySearchTextLower = this.countrySearchText.toLowerCase();
    // @ts-ignore
		const country = this.allCountries.filter((c) => {
			if (this.searchCountryField.indexOf(SearchCountryField.All) > -1) {
				// Search in all fields
				if (c.iso2.toLowerCase().startsWith(countrySearchTextLower)) {
					return c;
				}
				if (c.name.toLowerCase().startsWith(countrySearchTextLower)) {
					return c;
				}
				if (c.dialCode.startsWith(this.countrySearchText)) {
					return c;
				}
			} else {
				// Or search by specific SearchCountryField(s)
				if (this.searchCountryField.indexOf(SearchCountryField.Iso2) > -1) {
					if (c.iso2.toLowerCase().startsWith(countrySearchTextLower)) {
						return c;
					}
				}
				if (this.searchCountryField.indexOf(SearchCountryField.Name) > -1) {
					if (c.name.toLowerCase().startsWith(countrySearchTextLower)) {
						return c;
					}
				}
				if (this.searchCountryField.indexOf(SearchCountryField.DialCode) > -1) {
					if (c.dialCode.startsWith(this.countrySearchText)) {
						return c;
					}
				}
			}
		});

		if (country.length > 0) {
			const el = this.countryList.nativeElement.querySelector(
				'#' + country[0].htmlId
			);
			if (el) {
				el.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'nearest',
				});
			}
		}

		this.checkSeparateDialCodeStyle();
	}

	public onPhoneNumberChange(): void {
		let countryCode: string | undefined;
		// Handle the case where the user sets the value programatically based on a persisted ChangeData obj.
		if (this.phoneNumber && typeof this.phoneNumber === 'object') {
			const numberObj: ChangeData = this.phoneNumber;
			this.phoneNumber = numberObj.number;
			countryCode = numberObj.countryCode;
		}

		this.value = this.phoneNumber;
		let intlNumber = this.value;
		countryCode = countryCode || this.selectedCountry.iso2;
		if (this.phoneNumber && !this.phoneNumber.startsWith('+') && this.selectedCountry?.dialCode) {
			intlNumber = `+${this.selectedCountry.dialCode}${this.value}`;
		}
		let number;
		if (intlNumber) {
			number = this.getParsedNumber(intlNumber, countryCode);
		}

		// auto select country based on the extension (and areaCode if needed) (e.g select Canada if number starts with +1 416)
		if (this.enableAutoCountrySelect) {
			countryCode =
				number
					? this.getCountryIsoCode(number.countryCallingCode as string, number)
					: this.selectedCountry.iso2;
			if (countryCode && countryCode !== this.selectedCountry.iso2) {
				const newCountry = this.allCountries
					.slice().sort((a, b) => {
						return a.priority - b.priority;
					})
					.find((c) => c.iso2 === countryCode);
				if (newCountry) {
					this.selectedCountry = newCountry;
				}
			}
		}
		countryCode = countryCode ? countryCode : this.selectedCountry.iso2;

		this.checkSeparateDialCodeStyle();

		if (!this.value) {
			// Reason: avoid https://stackoverflow.com/a/54358133/1617590
			// tslint:disable-next-line: no-null-keyword
			// @ts-ignore
      this.propagateChange(null);
		} else {
			const intlNo = number
				? number.formatInternational()
				: '';

			// parse phoneNumber if separate dial code is needed
			if (this.separateDialCode && intlNo) {
				this.value = this.removeDialCode(intlNo);
				this.phoneNumber = this.value;
			}

			this.propagateChange({
				number: this.value,
				internationalNumber: intlNo,
				nationalNumber: number
					? number.formatNational()
					: '',
				e164Number: number
					? number.format('E.164')
					: '',
				countryCode: this.selectedCountry.iso2.toUpperCase(),
				dialCode: '+' + this.selectedCountry.dialCode,
			});
		}
	}

	public onCountrySelect(country: Country, el: { focus: () => void; }): void {
		this.setSelectedCountry(country);

		this.checkSeparateDialCodeStyle();

		if (this.phoneNumber && this.phoneNumber.length > 0) {
			this.value = this.phoneNumber;
			const number = this.getParsedNumber(
				this.phoneNumber,
				this.selectedCountry.iso2
			);
			const intlNo = number
				? number.formatInternational()
				: '';
			// parse phoneNumber if separate dial code is needed
			if (this.separateDialCode && intlNo) {
				this.value = this.removeDialCode(intlNo);
			}

			this.propagateChange({
				number: this.value,
				internationalNumber: intlNo,
				nationalNumber: number
					? number.formatNational()
					: '',
				e164Number: number
					? number.format('E.164')
					: '',
				countryCode: this.selectedCountry.iso2.toUpperCase(),
				dialCode: '+' + this.selectedCountry.dialCode,
			});
		} else {
			// Reason: avoid https://stackoverflow.com/a/54358133/1617590
			// tslint:disable-next-line: no-null-keyword
			// @ts-ignore
      this.propagateChange(null);
		}

		el.focus();
	}

	public onInputKeyPress(event: KeyboardEvent): void {
		const allowedChars = /[0-9\+\-\(\)\ ]/;
		const allowedCtrlChars = /[axcv]/; // Allows copy-pasting
		const allowedOtherKeys = [
			'ArrowLeft',
			'ArrowUp',
			'ArrowRight',
			'ArrowDown',
			'Home',
			'End',
			'Insert',
			'Delete',
			'Backspace',
		];

		if (
			!allowedChars.test(event.key) &&
			!(event.ctrlKey && allowedCtrlChars.test(event.key)) &&
			!allowedOtherKeys.includes(event.key)
		) {
			event.preventDefault();
		}
	}

	registerOnChange(fn: any): void {
		this.propagateChange = fn;
	}

	registerOnTouched(fn: any) {
		this.onTouched = fn;
	}

	setDisabledState(isDisabled: boolean): void {
		this.disabled = isDisabled;
	}

	writeValue(obj: any): void {
		if (obj === undefined) {
			this.init();
		}
		this.phoneNumber = obj;

		this.onPhoneNumberChange();
		this.cdr.detectChanges();
		//since this is user input during initialization or patch, so better to mark it as pristine
		if (this.markPristineOnExternalChange) {
			if (this.ngControl.control) {
				this.ngControl.control.statusChanges.pipe(take(1)).subscribe(() => {
					this.ngControl.control?.markAsPristine();
				})
			}
		}
	}

	ngAfterContentInit() {
		if (this.ngControl.control) {
			this.ngControl.control.statusChanges.pipe(take(1)).subscribe(() => {
				this.ngControl.control?.markAsPristine();
			})
		}
	}

	resolvePlaceholder(): string {
		let placeholder = '';
		if (this.customPlaceholder) {
			placeholder = this.customPlaceholder;
		} else if (this.selectedCountry.placeHolder) {
			placeholder = this.selectedCountry.placeHolder;
			if (this.separateDialCode) {
				placeholder = this.removeDialCode(placeholder);
			}
		}
		return placeholder;
	}

	/* --------------------------------- Helpers -------------------------------- */
	/**
	 * Returns parse PhoneNumber object.
	 * @param phoneNumber string
	 * @param countryCode string
	 */
	private getParsedNumber(
		phoneNumber: string,
		countryCode: string
	): lpn.PhoneNumber {
		let number: lpn.PhoneNumber;
		try {
			const countryCodeUpperCase = countryCode.toUpperCase()  as lpn.CountryCode;
			number = lpn.parsePhoneNumber(phoneNumber, countryCodeUpperCase);
		} catch (e) {}
		// @ts-ignore
    return number;
	}

	/**
	 * Adjusts input alignment based on the dial code presentation style.
	 */
	private checkSeparateDialCodeStyle() {
		if (this.separateDialCode && this.selectedCountry) {
			const cntryCd = this.selectedCountry.dialCode;
			this.separateDialCodeClass =
				'separate-dial-code iti-sdc-' + (cntryCd.length + 1);
		} else {
			this.separateDialCodeClass = '';
		}
	}

	/**
	 * Cleans dialcode from phone number string.
	 * @param phoneNumber string
	 */
	private removeDialCode(phoneNumber: string): string {
		const number = this.getParsedNumber(phoneNumber, this.selectedCountry.iso2);
		if (phoneNumber.startsWith('+') && this.separateDialCode) {
			phoneNumber = phoneNumber.substr(phoneNumber.indexOf(number.countryCallingCode as string) + number.countryCallingCode.length + 1);
		}
		return phoneNumber;
	}

	/**
	 * Sifts through all countries and returns iso code of the primary country
	 * based on the number provided.
	 * @param countryCode country code in number format
	 * @param number PhoneNumber object
	 */
	private getCountryIsoCode(
		countryCode: string,
		number: lpn.PhoneNumber
	): string | undefined {
		// List of all countries with countryCode (can be more than one. e.x. US, CA, DO, PR all have +1 countryCode)
		const countries = this.allCountries.filter(
			(c) => c.dialCode === countryCode.toString()
		);
		// Main country is the country, which has no areaCodes specified in country-code.ts file.
		const mainCountry = countries.find((c) => c.areaCodes === undefined);

		let matchedCountry = mainCountry ? mainCountry.iso2 : undefined;


		if (number.country && number.country.toLowerCase() !== matchedCountry) {
			matchedCountry = number.country.toLowerCase();
		}
		return matchedCountry;
	}

	/**
	 * Gets formatted example phone number from phoneUtil.
	 * @param countryCode string
	 */
	protected getPhoneNumberPlaceHolder(countryCode: string): string {
		let placeHolder = '';
		try {
			const lpnCountryCode = countryCode as lpn.CountryCode
			const exampleNumber = lpn.getExampleNumber(lpnCountryCode, examples);
			if (exampleNumber) {
				placeHolder = lpn.formatNumber((exampleNumber.nationalNumber as string), lpnCountryCode, 'NATIONAL');
			} else  {
				placeHolder = this.fallbackPlaceholder;
			}
		} catch (e) {
			console.error(`Exception while getting placeholder for countryCode [${countryCode}]`, e);
		}
		return placeHolder;
	}

	/**
	 * Clearing the list to avoid duplicates (https://github.com/webcat12345/ngx-intl-tel-input/issues/248)
	 */
	protected fetchCountryData(): void {
		this.allCountries = [];

		this.countryCodeData.allCountries.forEach((c) => {
			const country: Country = {
				name: c[0].toString(),
				iso2: c[1].toString(),
				dialCode: c[2].toString(),
				priority: +c[3] || 0,
				areaCodes: (c[4] as string[]) || undefined,
				htmlId: `iti-0__item-${c[1].toString()}`,
				flagClass: `iti__${c[1].toString().toLocaleLowerCase()}`,
				placeHolder: '',
			};

			if (this.enablePlaceholder) {
				country.placeHolder = this.getPhoneNumberPlaceHolder(
					country.iso2.toUpperCase()
				);
			}

			this.allCountries.push(country);
		});
	}

	/**
	 * Populates preferredCountriesInDropDown with prefferred countries.
	 */
	private updatePreferredCountries() {
		if (this.preferredCountries.length) {
			this.preferredCountriesInDropDown = [];
			this.preferredCountries.forEach((iso2) => {
				const preferredCountry = this.allCountries.filter((c) => {
					return c.iso2 === iso2;
				});

				this.preferredCountriesInDropDown.push(preferredCountry[0]);
			});
		}
	}

	/**
	 * Updates selectedCountry.
	 */
	private updateSelectedCountry() {
		if (this.selectedCountryISO) {
			const selectedCountry = this.allCountries.find((c) => {
				return c.iso2.toLowerCase() === this.selectedCountryISO.toLowerCase();
			});
			console.log("Selected Country ISO:", this.selectedCountry)
			if (selectedCountry) {
				this.selectedCountry = selectedCountry;
				if (this.phoneNumber) {
					this.onPhoneNumberChange();
				} else {
					// Reason: avoid https://stackoverflow.com/a/54358133/1617590
					// tslint:disable-next-line: no-null-keyword
					// @ts-ignore
          this.propagateChange(null);
				}
			}
		}
	}
}
