import TestDrive from '../TestDrive';
import {translate} from '../../lib/i18n.mjs';
export const metadata = {title:translate('it','meta.demoTitle'),description:translate('it','meta.demoDescription')};
export default function ProvaPage(){return <TestDrive/>;}
