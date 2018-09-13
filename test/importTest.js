import { expect } from 'chai';
import amqp from '../src';

describe('import test', function() {
    it('should let you import as default (#51)', function() {
        expect(amqp).to.exist;
        expect(amqp.connect).to.exist;
    });
});