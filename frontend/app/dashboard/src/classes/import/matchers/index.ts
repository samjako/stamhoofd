import { MatcherCategory } from "../MatcherCategory";
import { BirthDayColumnMatcher } from "./BirthDayColumnMatcher";
import { CityColumnMatcher } from "./CityColumnMatcher";
import { CityWithZipColumnMatcher } from "./CityWithZipColumnMatcher";
import { EmailColumnMatcher } from "./EmailColumnMatcher";
import { FirstNameColumnMatcher } from "./FirstNameColumnMatcher";
import { FullNameColumnMatcher } from "./FullNameColumnMatcher";
import { GenderColumnMatcher } from "./GenderColumnMatcher";
import { GroupColumnMatcher } from "./GroupColumnMatcher";
import { LastNameColumnMatcher } from "./LastNameColumnMatcher";
import { MemberNumberColumnMatcher } from "./MemberNumberColumnMatcher";
import { PaidColumnMatcher } from "./PaidColumnMatcher";
import { PaidPriceColumnMatcher } from "./PaidPriceColumnMatcher";
import { PaymentPriceColumnMatcher } from "./PaymentPriceColumnMatcher";
import { PhoneColumnMatcher } from "./PhoneColumnMatcher";
import { RegisterDateColumnMatcher } from "./RegisterDateColumnMatcher";
import { StreetColumnMatcher } from "./StreetColumnMatcher";
import { StreetNumberColumnMatcher } from "./StreetNumberColumnMatcher";
import { StreetWithNumberColumnMatcher } from "./StreetWithNumberColumnMatcher";
import { ZipColumnMatcher } from "./ZipColumnMatcher";

// Always make sure fullname is before lastname!
export const memberMatchers = [
    new MemberNumberColumnMatcher(),
    new FullNameColumnMatcher(MatcherCategory.Member),
    new FirstNameColumnMatcher(MatcherCategory.Member),
    new LastNameColumnMatcher(MatcherCategory.Member),
    new BirthDayColumnMatcher(),
    new GenderColumnMatcher(),
    new GroupColumnMatcher(),
    new PhoneColumnMatcher(MatcherCategory.Member),
    new EmailColumnMatcher(MatcherCategory.Member),
    new StreetWithNumberColumnMatcher(MatcherCategory.Member),
    new StreetColumnMatcher(MatcherCategory.Member),
    new StreetNumberColumnMatcher(MatcherCategory.Member),
    new CityColumnMatcher(MatcherCategory.Member),
    new ZipColumnMatcher(MatcherCategory.Member),
    new CityWithZipColumnMatcher(MatcherCategory.Member),
    new RegisterDateColumnMatcher(),
]

export const parentMatchers1 = [
    new FullNameColumnMatcher(MatcherCategory.Parent1),
    new FirstNameColumnMatcher(MatcherCategory.Parent1),
    new LastNameColumnMatcher(MatcherCategory.Parent1),
    new PhoneColumnMatcher(MatcherCategory.Parent1),
    new EmailColumnMatcher(MatcherCategory.Parent1),
    new StreetWithNumberColumnMatcher(MatcherCategory.Parent1),
    new StreetColumnMatcher(MatcherCategory.Parent1),
    new StreetNumberColumnMatcher(MatcherCategory.Parent1),
    new CityColumnMatcher(MatcherCategory.Parent1),
    new ZipColumnMatcher(MatcherCategory.Parent1),
    new CityWithZipColumnMatcher(MatcherCategory.Parent1)
]


export const parentMatchers2 = [
    new FullNameColumnMatcher(MatcherCategory.Parent2),
    new FirstNameColumnMatcher(MatcherCategory.Parent2),
    new LastNameColumnMatcher(MatcherCategory.Parent2),
    new PhoneColumnMatcher(MatcherCategory.Parent2),
    new EmailColumnMatcher(MatcherCategory.Parent2),
    new StreetWithNumberColumnMatcher(MatcherCategory.Parent2),
    new StreetColumnMatcher(MatcherCategory.Parent2),
    new StreetNumberColumnMatcher(MatcherCategory.Parent2),
    new CityColumnMatcher(MatcherCategory.Parent2),
    new ZipColumnMatcher(MatcherCategory.Parent2),
    new CityWithZipColumnMatcher(MatcherCategory.Parent2)
]

export const paymentMatchers = [
    new PaidColumnMatcher(),
    new PaidPriceColumnMatcher(),
    new PaymentPriceColumnMatcher()
]

export const allMathcers = [
    ...memberMatchers,
    ...paymentMatchers,
    ...parentMatchers1,
    ...parentMatchers2
]
