const test = require('tape');
const sinon = require('sinon');
const { Permissions } = require('discord.js');

const { checkPerms } = require('../../src/modules/security');
const mockMember = require('../helpers/mock-member');

test('checkPerms', suite => {
    suite.test('given non-member input - returns false', t => {
        const inputs = [
            'hello world',
            true,
            undefined,
            0,
            () => {},
        ];
        t.plan(inputs.length);
        inputs.forEach(input => t.deepEqual(
            checkPerms(input, 'admin'),
            false,
            `should return false for random stuff - ${typeof input}`,
        ));
        sinon.reset();

    });
    suite.test('given member input (non-owner, non-admin) - returns false', t => {

        t.plan(1);
        const mockMemberStub = mockMember({
            hasPermissionStub: sinon.stub().withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(false),
        });
        t.deepEqual(
            checkPerms(mockMemberStub, 'admin'),
            false,
            'should return false non-owner, non ADMIN',
        );
        sinon.reset();
    });
    suite.test('given member input (owner) - returns true', t => {

        t.plan(2);
        const mockMemberStub = mockMember();
        mockMemberStub.client.settings.owner = mockMemberStub.id;
        t.deepEqual(
            checkPerms(mockMemberStub, 'admin'),
            true,
            `should return true for the owner ${mockMemberStub.client.settings.owner}, ${mockMemberStub.id} even when not server admin`,
        );
        t.strictEqual(mockMemberStub.permissions.has.callCount, 0, 'should not check perms of owner');
        sinon.reset();
    });
    suite.test('given member input (non-owner, admin) - returns true', t => {

        t.plan(1);
        const mockMemberStub = mockMember({
            hasPermissionStub: sinon.stub().withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(true),
        });
        mockMemberStub.client.settings.owner = mockMemberStub.id;
        t.deepEqual(
            checkPerms(mockMemberStub, 'admin'),
            true,
            'should return true for the owner when server admin',
        );
        sinon.reset();
    });
    suite.test('given member input (non-owner, mod) - returns false for admin', t => {

        t.plan(1);
        const mockMemberStub = mockMember();
        mockMemberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(false);
        mockMemberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(true),
        t.deepEqual(
            checkPerms(mockMemberStub, 'admin'),
            false,
            'should return false for non-owner, non-admin',
        );
        sinon.reset();
    });
    suite.test('given member input (non-owner, mod) - returns true for mod', t => {

        t.plan(1);
        const mockMemberStub = mockMember();
        mockMemberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(false);
        mockMemberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(true),
        t.deepEqual(
            checkPerms(mockMemberStub, 'mod'),
            true,
            'should return true for non-owner, mod',
        );
        sinon.reset();
    });
    suite.test('given member input (non-owner, admin) - returns true for mod', t => {

        t.plan(1);
        const mockMemberStub = mockMember();
        mockMemberStub.permissions.has.withArgs(Permissions.FLAGS.ADMINISTRATOR).returns(true);
        mockMemberStub.permissions.has.withArgs(Permissions.FLAGS.MANAGE_MESSAGES).returns(false),
        t.deepEqual(
            checkPerms(mockMemberStub, 'mod'),
            true,
            'should return true for non-owner, admin',
        );
        sinon.reset();
    });
    suite.test('given member input (non-owner, non-admin, non-mod) - returns false for mod', t => {

        t.plan(1);
        const mockMemberStub = mockMember({
            hasPermissionStub: () => false,
        });
        t.deepEqual(
            checkPerms(mockMemberStub, 'mod'),
            false,
            'should return false for non-owner, nonadmin, nonmod',
        );
        sinon.reset();
    });

    suite.test('Module Cleanup', t => {
        sinon.restore();
        t.end();
    });
});
