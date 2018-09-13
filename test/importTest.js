import { expect } from 'chai';
import amqp from '../src';

describe('import test', function() {
    it('should let you import as default', function() {
        expect(amqp).to.exist;
        expect(amqp.connect).to.exist;
    });
});